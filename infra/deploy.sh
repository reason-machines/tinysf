#!/usr/bin/env bash
# tiny SF infrastructure: one EC2 t4g.small behind CloudFront, DynamoDB, S3 artifacts.
#
#   ./deploy.sh up        create whatever is missing (idempotent)
#   ./deploy.sh push      upload index.html + server.js, restart the service
#   ./deploy.sh status    instance, service and CloudFront state
#   ./deploy.sh wait-cdn  block (bounded) until the distribution is Deployed
#   ./deploy.sh down      delete everything this script created
#
# Credentials come from the environment and are never written anywhere:
# TINY_SF_AWS_ACCESS_KEY_ID / TINY_SF_AWS_SECRET_ACCESS_KEY when set, otherwise the
# ambient AWS credentials. Set TINY_SF_ACCOUNT to an account id and anything else is refused.
# Every resource is named tiny-sf* and tagged project=tiny-sf. state.json holds
# ids and names only; it is a cache, every step also finds its resource by name.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$HERE/.." && pwd)"
STATE="$HERE/state.json"

REGION="us-west-2"
EXPECT_ACCOUNT="${TINY_SF_ACCOUNT:-}"   # set it to refuse any other AWS account
NAME="tiny-sf"
SERVER_NAME="tiny-sf-server"          # role, instance profile, security group, instance, EIP
TABLE="tiny-sf"
INSTANCE_TYPE="t4g.small"
PORT=8080
BUN_VERSION="${TINY_SF_BUN_VERSION:-latest}"   # or e.g. bun-v1.3.2
AMI_PARAM="/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
CF_PREFIX_LIST="com.amazonaws.global.cloudfront.origin-facing"
CACHE_POLICY="4135ea2d-6df8-44a3-9df3-4b5a84be39ad"            # CachingDisabled
ORIGIN_REQUEST_POLICY="216adef6-5c7f-47e4-b989-5492eafa07d3"   # AllViewer
SSM_POLICY_ARN="arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"

export PATH="$HOME/.local/bin:$PATH"

log() { printf '\033[2m[tiny-sf]\033[0m %s\n' "$*" >&2; }
die() { printf '[tiny-sf] error: %s\n' "$*" >&2; exit 1; }

aws_() {
  if [[ -n "${TINY_SF_AWS_ACCESS_KEY_ID:-}" && -n "${TINY_SF_AWS_SECRET_ACCESS_KEY:-}" ]]; then
    env -u AWS_PROFILE -u AWS_DEFAULT_PROFILE -u AWS_SESSION_TOKEN \
      AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null AWS_PAGER="" \
      AWS_ACCESS_KEY_ID="$TINY_SF_AWS_ACCESS_KEY_ID" \
      AWS_SECRET_ACCESS_KEY="$TINY_SF_AWS_SECRET_ACCESS_KEY" \
      aws --region "$REGION" "$@"
  else
    AWS_PAGER="" aws --region "$REGION" "$@"
  fi
}

# text output with "None"/empty normalised to an empty string
awst() {
  local out
  out="$(aws_ "$@" --output text)" || return $?
  [[ "$out" == "None" || "$out" == "null" ]] && out=""
  printf '%s' "$out"
}

state_get() { [[ -f "$STATE" ]] && jq -r --arg k "$1" '.[$k] // empty' "$STATE" || true; }
state_set() {
  local tmp; tmp="$(mktemp)"
  if [[ -f "$STATE" ]]; then cat "$STATE"; else echo '{}'; fi \
    | jq --arg k "$1" --arg v "$2" '.[$k] = $v' > "$tmp"
  mv "$tmp" "$STATE"
}
state_del() {
  [[ -f "$STATE" ]] || return 0
  local tmp; tmp="$(mktemp)"
  jq --arg k "$1" 'del(.[$k])' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
}

preflight() {
  command -v aws >/dev/null || die "aws CLI not found"
  command -v jq >/dev/null || die "jq not found"
  ACCOUNT="$(awst sts get-caller-identity --query Account)"
  [[ -z "$EXPECT_ACCOUNT" || "$ACCOUNT" == "$EXPECT_ACCOUNT" ]] \
    || die "signed in to account '$ACCOUNT', expected $EXPECT_ACCOUNT (TINY_SF_ACCOUNT)"
  BUCKET="tiny-sf-artifacts-${ACCOUNT}-usw2"
  TABLE_ARN="arn:aws:dynamodb:${REGION}:${ACCOUNT}:table/${TABLE}"
  state_set account "$ACCOUNT"
  state_set region "$REGION"
}

# ---------------------------------------------------------------- lookups

find_instance() {
  awst ec2 describe-instances \
    --filters "Name=tag:Name,Values=$SERVER_NAME" "Name=tag:project,Values=$NAME" \
              "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query 'Reservations[].Instances[].InstanceId | [0]'
}
find_eip_alloc() {
  awst ec2 describe-addresses \
    --filters "Name=tag:Name,Values=$SERVER_NAME" "Name=tag:project,Values=$NAME" \
    --query 'Addresses[0].AllocationId'
}
find_sg() {
  local vpc="$1"
  awst ec2 describe-security-groups \
    --filters "Name=group-name,Values=$SERVER_NAME" "Name=vpc-id,Values=$vpc" \
    --query 'SecurityGroups[0].GroupId'
}
find_distribution() {
  awst cloudfront list-distributions \
    --query "DistributionList.Items[?Comment=='$NAME'].Id | [0]"
}
default_vpc() {
  awst ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId'
}
eip_dns() { printf 'ec2-%s.%s.compute.amazonaws.com' "${1//./-}" "$REGION"; }

# ---------------------------------------------------------------- up: pieces

ensure_bucket() {
  if aws_ s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
    log "bucket $BUCKET exists"
  else
    log "creating bucket $BUCKET"
    aws_ s3api create-bucket --bucket "$BUCKET" \
      --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
    aws_ s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
      BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
    aws_ s3api put-bucket-tagging --bucket "$BUCKET" \
      --tagging "TagSet=[{Key=project,Value=$NAME},{Key=Name,Value=$BUCKET}]"
  fi
  state_set bucket "$BUCKET"
}

ensure_table() {
  if aws_ dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
    log "table $TABLE exists"
  else
    log "creating DynamoDB table $TABLE"
    aws_ dynamodb create-table --table-name "$TABLE" \
      --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
      --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
      --billing-mode PAY_PER_REQUEST \
      --tags "Key=project,Value=$NAME" >/dev/null
  fi
  aws_ dynamodb wait table-exists --table-name "$TABLE"
  local ttl
  ttl="$(awst dynamodb describe-time-to-live --table-name "$TABLE" \
          --query 'TimeToLiveDescription.TimeToLiveStatus')"
  if [[ "$ttl" != "ENABLED" && "$ttl" != "ENABLING" ]]; then
    log "enabling TTL on attribute ttl"
    aws_ dynamodb update-time-to-live --table-name "$TABLE" \
      --time-to-live-specification "Enabled=true,AttributeName=ttl" >/dev/null
  fi
  state_set table "$TABLE"
}

ensure_iam() {
  if ! aws_ iam get-role --role-name "$SERVER_NAME" >/dev/null 2>&1; then
    log "creating IAM role $SERVER_NAME"
    aws_ iam create-role --role-name "$SERVER_NAME" \
      --description "tiny SF server instance role" \
      --tags "Key=project,Value=$NAME" \
      --assume-role-policy-document '{
        "Version":"2012-10-17",
        "Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]
      }' >/dev/null
  else
    log "IAM role $SERVER_NAME exists"
  fi
  aws_ iam attach-role-policy --role-name "$SERVER_NAME" --policy-arn "$SSM_POLICY_ARN"
  local policy
  policy="$(jq -n --arg b "arn:aws:s3:::$BUCKET" --arg t "$TABLE_ARN" '{
    Version: "2012-10-17",
    Statement: [
      {Sid: "ArtifactsList", Effect: "Allow", Action: ["s3:ListBucket", "s3:GetBucketLocation"], Resource: $b},
      {Sid: "ArtifactsRead", Effect: "Allow", Action: ["s3:GetObject"], Resource: ($b + "/*")},
      {Sid: "Table", Effect: "Allow",
       Action: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
                "dynamodb:Query", "dynamodb:DeleteItem", "dynamodb:BatchWriteItem"],
       Resource: $t}
    ]}')"
  aws_ iam put-role-policy --role-name "$SERVER_NAME" --policy-name "$NAME-app" \
    --policy-document "$policy"
  if ! aws_ iam get-instance-profile --instance-profile-name "$SERVER_NAME" >/dev/null 2>&1; then
    log "creating instance profile $SERVER_NAME"
    aws_ iam create-instance-profile --instance-profile-name "$SERVER_NAME" \
      --tags "Key=project,Value=$NAME" >/dev/null
  fi
  local has
  has="$(awst iam get-instance-profile --instance-profile-name "$SERVER_NAME" \
          --query "InstanceProfile.Roles[?RoleName=='$SERVER_NAME'].RoleName | [0]")"
  if [[ -z "$has" ]]; then
    aws_ iam add-role-to-instance-profile --instance-profile-name "$SERVER_NAME" \
      --role-name "$SERVER_NAME"
  fi
  state_set role "$SERVER_NAME"
  state_set instance_profile "$SERVER_NAME"
}

ensure_sg() {
  local vpc="$1" sg pl has
  sg="$(find_sg "$vpc")"
  if [[ -z "$sg" ]]; then
    log "creating security group $SERVER_NAME in $vpc"
    sg="$(awst ec2 create-security-group --group-name "$SERVER_NAME" --vpc-id "$vpc" \
      --description "tiny SF server: TCP $PORT from CloudFront only" \
      --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=$SERVER_NAME},{Key=project,Value=$NAME}]" \
      --query GroupId)"
  else
    log "security group $sg exists"
  fi
  pl="$(awst ec2 describe-managed-prefix-lists \
        --filters "Name=prefix-list-name,Values=$CF_PREFIX_LIST" --query 'PrefixLists[0].PrefixListId')"
  [[ -n "$pl" ]] || die "CloudFront origin-facing prefix list not found in $REGION"
  has="$(awst ec2 describe-security-groups --group-ids "$sg" \
    --query "SecurityGroups[0].IpPermissions[?FromPort==\`$PORT\` && ToPort==\`$PORT\`].PrefixListIds[] | [?PrefixListId=='$pl'].PrefixListId | [0]")"
  if [[ -z "$has" ]]; then
    log "allowing TCP $PORT from $pl (CloudFront origin-facing)"
    aws_ ec2 authorize-security-group-ingress --group-id "$sg" --ip-permissions \
      "IpProtocol=tcp,FromPort=$PORT,ToPort=$PORT,PrefixListIds=[{PrefixListId=$pl,Description=cloudfront-origin-facing}]" \
      >/dev/null
  fi
  state_set vpc "$vpc"
  state_set security_group "$sg"
  SG_ID="$sg"
}

ensure_eip() {
  local alloc
  alloc="$(find_eip_alloc)"
  if [[ -z "$alloc" ]]; then
    log "allocating Elastic IP"
    alloc="$(awst ec2 allocate-address --domain vpc \
      --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$SERVER_NAME},{Key=project,Value=$NAME}]" \
      --query AllocationId)"
  fi
  EIP_ALLOC="$alloc"
  EIP_IP="$(awst ec2 describe-addresses --allocation-ids "$alloc" --query 'Addresses[0].PublicIp')"
  EIP_DNS="$(eip_dns "$EIP_IP")"
  log "Elastic IP $EIP_IP ($EIP_DNS)"
  state_set eip_allocation "$alloc"
  state_set eip "$EIP_IP"
  state_set eip_dns "$EIP_DNS"
}

user_data() {
  local bun_url
  if [[ "$BUN_VERSION" == "latest" ]]; then
    bun_url="https://github.com/oven-sh/bun/releases/latest/download/bun-linux-aarch64.zip"
  else
    bun_url="https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/bun-linux-aarch64.zip"
  fi
  cat <<EOF
#!/bin/bash
# tiny SF first-boot setup (cloud-init user-data). Log: /var/log/cloud-init-output.log
set -euxo pipefail

retry() { local n=0; until "\$@"; do n=\$((n+1)); [ "\$n" -ge 12 ] && return 1; sleep 5; done; }

retry dnf install -y unzip

# bun for arm64 into /opt/bun
mkdir -p /opt/bun/bin
retry curl -fsSL --connect-timeout 10 --max-time 120 -o /tmp/bun.zip "$bun_url"
rm -rf /tmp/bun-unzip && unzip -o -q /tmp/bun.zip -d /tmp/bun-unzip
install -m 0755 /tmp/bun-unzip/bun-linux-aarch64/bun /opt/bun/bin/bun
rm -rf /tmp/bun.zip /tmp/bun-unzip
/opt/bun/bin/bun --version

id tinysf >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/tinysf --shell /sbin/nologin tinysf
mkdir -p /opt/tiny-sf
chown -R tinysf:tinysf /opt/tiny-sf

cat > /etc/systemd/system/tiny-sf.service <<'UNIT'
[Unit]
Description=tiny SF server
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
User=tinysf
Group=tinysf
WorkingDirectory=/opt/tiny-sf
Environment=PORT=$PORT
Environment=TABLE=$TABLE
Environment=AWS_REGION=$REGION
Environment=AWS_DEFAULT_REGION=$REGION
Environment=STATIC_DIR=/opt/tiny-sf
Environment=HOME=/var/lib/tinysf
ExecStartPre=/usr/bin/aws s3 sync s3://$BUCKET/current/ /opt/tiny-sf/ --exact-timestamps --no-progress
ExecStart=/opt/bun/bin/bun /opt/tiny-sf/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable tiny-sf.service
systemctl restart tiny-sf.service || true
EOF
}

ensure_instance() {
  local vpc="$1" id state
  id="$(find_instance)"
  if [[ -z "$id" ]]; then
    local ami root azs subnet ud tags
    ami="$(awst ssm get-parameter --name "$AMI_PARAM" --query Parameter.Value)"
    root="$(awst ec2 describe-images --image-ids "$ami" --query 'Images[0].RootDeviceName')"
    azs="$(awst ec2 describe-instance-type-offerings --location-type availability-zone \
            --filters "Name=instance-type,Values=$INSTANCE_TYPE" \
            --query 'InstanceTypeOfferings[].Location' | tr '\t' ',')"
    subnet="$(awst ec2 describe-subnets \
      --filters "Name=vpc-id,Values=$vpc" "Name=default-for-az,Values=true" \
                "Name=availability-zone,Values=$azs" \
      --query 'sort_by(Subnets,&AvailabilityZone)[0].SubnetId')"
    [[ -n "$subnet" ]] || die "no default subnet offering $INSTANCE_TYPE in $vpc"
    ud="$(mktemp)"; user_data > "$ud"
    tags="[{Key=Name,Value=$SERVER_NAME},{Key=project,Value=$NAME}]"
    log "launching $INSTANCE_TYPE from $ami in $subnet"
    local n=0
    until id="$(awst ec2 run-instances \
        --image-id "$ami" --instance-type "$INSTANCE_TYPE" \
        --iam-instance-profile "Name=$SERVER_NAME" \
        --network-interfaces "DeviceIndex=0,SubnetId=$subnet,Groups=$SG_ID,AssociatePublicIpAddress=true" \
        --block-device-mappings "DeviceName=$root,Ebs={VolumeSize=8,VolumeType=gp3,DeleteOnTermination=true,Encrypted=true}" \
        --metadata-options "HttpTokens=required,HttpEndpoint=enabled,HttpPutResponseHopLimit=1" \
        --credit-specification "CpuCredits=standard" \
        --user-data "file://$ud" \
        --tag-specifications "ResourceType=instance,Tags=$tags" "ResourceType=volume,Tags=$tags" \
                             "ResourceType=network-interface,Tags=$tags" \
        --query 'Instances[0].InstanceId' 2>"$ud.err")"; do
      n=$((n + 1))
      # a just-created instance profile takes a few seconds to become usable
      if [[ "$n" -ge 12 ]] || ! grep -qi 'instance profile' "$ud.err"; then
        cat "$ud.err" >&2; rm -f "$ud" "$ud.err"; die "run-instances failed"
      fi
      sleep 5
    done
    rm -f "$ud" "$ud.err"
  else
    log "instance $id exists"
  fi
  state_set instance "$id"
  INSTANCE_ID="$id"
  state="$(awst ec2 describe-instances --instance-ids "$id" --query 'Reservations[0].Instances[0].State.Name')"
  if [[ "$state" == "stopping" ]]; then aws_ ec2 wait instance-stopped --instance-ids "$id"; state=stopped; fi
  if [[ "$state" == "stopped" ]]; then
    log "starting stopped instance $id"
    aws_ ec2 start-instances --instance-ids "$id" >/dev/null
  fi
  aws_ ec2 wait instance-running --instance-ids "$id"
  local cur
  cur="$(awst ec2 describe-addresses --allocation-ids "$EIP_ALLOC" --query 'Addresses[0].InstanceId')"
  if [[ "$cur" != "$id" ]]; then
    log "associating $EIP_IP with $id"
    aws_ ec2 associate-address --allocation-id "$EIP_ALLOC" --instance-id "$id" >/dev/null
  fi
}

distribution_config() {
  jq -n --arg origin "$EIP_DNS" --arg name "$NAME" --arg ref "$NAME-$(date +%s)" \
        --arg cache "$CACHE_POLICY" --arg orp "$ORIGIN_REQUEST_POLICY" --argjson port "$PORT" '{
    DistributionConfig: {
      CallerReference: $ref,
      Comment: $name,
      Enabled: true,
      HttpVersion: "http2",
      PriceClass: "PriceClass_100",
      IsIPV6Enabled: true,
      Origins: {Quantity: 1, Items: [{
        Id: "tiny-sf-server",
        DomainName: $origin,
        OriginPath: "",
        CustomHeaders: {Quantity: 0},
        CustomOriginConfig: {
          HTTPPort: $port, HTTPSPort: 443,
          OriginProtocolPolicy: "http-only",
          OriginSslProtocols: {Quantity: 1, Items: ["TLSv1.2"]},
          OriginReadTimeout: 60, OriginKeepaliveTimeout: 60
        }
      }]},
      DefaultCacheBehavior: {
        TargetOriginId: "tiny-sf-server",
        ViewerProtocolPolicy: "redirect-to-https",
        AllowedMethods: {Quantity: 7,
          Items: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
          CachedMethods: {Quantity: 2, Items: ["GET", "HEAD"]}},
        Compress: true,
        CachePolicyId: $cache,
        OriginRequestPolicyId: $orp
      }
    },
    Tags: {Items: [{Key: "project", Value: $name}, {Key: "Name", Value: $name}]}
  }'
}

ensure_distribution() {
  local id cfg
  id="$(find_distribution)"
  if [[ -z "$id" ]]; then
    log "creating CloudFront distribution (origin $EIP_DNS:$PORT)"
    cfg="$(mktemp)"; distribution_config > "$cfg"
    id="$(awst cloudfront create-distribution-with-tags \
          --distribution-config-with-tags "file://$cfg" --query 'Distribution.Id')"
    rm -f "$cfg"
  else
    log "distribution $id exists"
    # keep the origin pointed at the Elastic IP if it was ever re-allocated
    local cur etag
    cfg="$(mktemp)"
    aws_ cloudfront get-distribution-config --id "$id" --output json > "$cfg"
    cur="$(jq -r '.DistributionConfig.Origins.Items[0].DomainName' "$cfg")"
    if [[ "$cur" != "$EIP_DNS" ]]; then
      log "repointing origin $cur -> $EIP_DNS"
      etag="$(jq -r .ETag "$cfg")"
      jq --arg o "$EIP_DNS" '.DistributionConfig | .Origins.Items[0].DomainName = $o' "$cfg" > "$cfg.new"
      aws_ cloudfront update-distribution --id "$id" --if-match "$etag" \
        --distribution-config "file://$cfg.new" >/dev/null
    fi
    rm -f "$cfg" "$cfg.new"
  fi
  CF_ID="$id"
  CF_DOMAIN="$(awst cloudfront get-distribution --id "$id" --query 'Distribution.DomainName')"
  state_set distribution "$id"
  state_set cloudfront_domain "$CF_DOMAIN"
}

# ---------------------------------------------------------------- artifacts + SSM

upload_artifacts() {
  local index="$APP_DIR/index.html" server="$APP_DIR/dist/server.js" tmp=""
  if [[ ! -f "$server" ]]; then
    log "dist/server.js missing: uploading infra/placeholder-server.js instead"
    server="$HERE/placeholder-server.js"
  fi
  if [[ ! -f "$index" ]]; then
    log "index.html missing: uploading a one-line placeholder"
    tmp="$(mktemp)"
    echo '<!doctype html><meta charset="utf-8"><title>tiny SF</title><p>tiny SF placeholder: the stack is up.</p>' > "$tmp"
    index="$tmp"
  fi
  aws_ s3 cp "$index" "s3://$BUCKET/current/index.html" \
    --content-type "text/html; charset=utf-8" --no-progress >&2
  aws_ s3 cp "$server" "s3://$BUCKET/current/server.js" \
    --content-type "application/javascript" --no-progress >&2
  [[ -n "$tmp" ]] && rm -f "$tmp"
  return 0
}

wait_ssm_online() {
  local id="$1" i ping
  for i in $(seq 1 45); do
    ping="$(awst ssm describe-instance-information \
      --filters "Key=InstanceIds,Values=$id" --query 'InstanceInformationList[0].PingStatus' || true)"
    [[ "$ping" == "Online" ]] && return 0
    sleep 5
  done
  die "instance $id is not registered with SSM yet (rerun in a minute)"
}

# ssm_run <instance> <script>: run a shell script as root, print its output, return its status
ssm_run() {
  local id="$1" script="$2" cmd st i out
  wait_ssm_online "$id"
  cmd="$(awst ssm send-command --instance-ids "$id" --document-name AWS-RunShellScript \
        --comment "tiny-sf deploy.sh" --timeout-seconds 120 \
        --parameters "$(jq -n --arg c "$script" '{commands: [$c], executionTimeout: ["300"]}')" \
        --query 'Command.CommandId')"
  st="Pending"
  for i in $(seq 1 110); do
    sleep 3
    st="$(awst ssm get-command-invocation --command-id "$cmd" --instance-id "$id" \
          --query Status 2>/dev/null || echo Pending)"
    case "$st" in Success|Failed|Cancelled|TimedOut) break ;; esac
  done
  out="$(aws_ ssm get-command-invocation --command-id "$cmd" --instance-id "$id" --output json)"
  jq -r '.StandardOutputContent' <<<"$out"
  jq -r '.StandardErrorContent | select(length > 0) | "--- stderr ---\n" + .' <<<"$out" >&2
  [[ "$st" == "Success" ]] || { log "SSM command $cmd ended $st"; return 1; }
}

require_instance() {
  INSTANCE_ID="$(state_get instance)"
  [[ -n "$INSTANCE_ID" ]] || INSTANCE_ID="$(find_instance)"
  [[ -n "$INSTANCE_ID" ]] || die "no tiny-sf instance: run ./deploy.sh up first"
}

# ---------------------------------------------------------------- commands

cmd_up() {
  preflight
  local vpc; vpc="$(default_vpc)"; [[ -n "$vpc" ]] || die "no default VPC in $REGION"
  ensure_bucket
  ensure_table
  ensure_iam
  ensure_sg "$vpc"
  ensure_eip
  if [[ -z "$(awst s3api list-objects-v2 --bucket "$BUCKET" --prefix current/server.js \
              --query 'Contents[0].Key')" ]]; then
    log "seeding s3://$BUCKET/current/ so the first boot has something to run"
    upload_artifacts
  fi
  ensure_instance "$vpc"
  ensure_distribution
  log "up complete"
  cat <<EOF
bucket        $BUCKET
table         $TABLE
instance      $INSTANCE_ID
elastic ip    $EIP_IP  ($EIP_DNS)
cloudfront    $CF_ID  https://$CF_DOMAIN
next          ./deploy.sh push   (a new distribution takes a few minutes: ./deploy.sh wait-cdn)
EOF
}

cmd_push() {
  preflight
  require_instance
  upload_artifacts
  log "restarting tiny-sf on $INSTANCE_ID through SSM"
  ssm_run "$INSTANCE_ID" '
timeout 240 cloud-init status --wait >/dev/null 2>&1 || true
systemctl restart tiny-sf
ok=0
for i in $(seq 1 20); do
  if curl -fs -m 3 -o /dev/null http://localhost:'"$PORT"'/api/health 2>/dev/null; then ok=1; break; fi
  sleep 1
done
echo "service: $(systemctl is-active tiny-sf)"
echo "health:  $(curl -sS -m 3 -w " (HTTP %{http_code})" http://localhost:'"$PORT"'/api/health 2>&1)"
echo "--- journal (last 20 lines) ---"
journalctl -u tiny-sf -n 20 --no-pager
[ "$ok" = 1 ]
'
}

cmd_status() {
  preflight
  local id cf
  id="$(state_get instance)"; [[ -n "$id" ]] || id="$(find_instance)"
  if [[ -z "$id" ]]; then
    echo "instance      (none)"
  else
    echo "instance      $id  $(awst ec2 describe-instances --instance-ids "$id" \
      --query 'Reservations[0].Instances[0].[State.Name,InstanceType,PublicIpAddress,PublicDnsName]' | tr '\t' ' ')"
    ssm_run "$id" '
echo "service       $(systemctl is-active tiny-sf) (enabled: $(systemctl is-enabled tiny-sf 2>&1))"
echo "bun           $(/opt/bun/bin/bun --version 2>&1)"
echo "health        $(curl -sS -m 3 -w " (HTTP %{http_code})" http://localhost:'"$PORT"'/api/health 2>&1)"
echo "--- journal (last 20 lines) ---"
journalctl -u tiny-sf -n 20 --no-pager
' || true
  fi
  cf="$(state_get distribution)"; [[ -n "$cf" ]] || cf="$(find_distribution)"
  if [[ -z "$cf" ]]; then
    echo "cloudfront    (none)"
  else
    echo "cloudfront    $cf  $(awst cloudfront get-distribution --id "$cf" \
      --query 'Distribution.[DomainName,Status,DistributionConfig.Enabled]' | tr '\t' ' ')"
  fi
}

cmd_wait_cdn() {
  preflight
  local cf st i
  cf="$(state_get distribution)"; [[ -n "$cf" ]] || cf="$(find_distribution)"
  [[ -n "$cf" ]] || die "no tiny-sf distribution"
  for i in $(seq 1 22); do          # about 3.5 minutes, then rerun
    st="$(awst cloudfront get-distribution --id "$cf" --query 'Distribution.Status')"
    if [[ "$st" == "Deployed" ]]; then echo "cloudfront $cf Deployed"; return 0; fi
    sleep 10
  done
  echo "cloudfront $cf still $st: run wait-cdn again"; return 2
}

cmd_down() {
  preflight
  local cf id alloc sg vpc

  # 1. CloudFront: disable, wait, delete (the slow part; rerun down if it times out)
  cf="$(find_distribution)"
  if [[ -n "$cf" ]]; then
    local cfg etag enabled st i
    cfg="$(mktemp)"
    aws_ cloudfront get-distribution-config --id "$cf" --output json > "$cfg"
    etag="$(jq -r .ETag "$cfg")"
    enabled="$(jq -r .DistributionConfig.Enabled "$cfg")"
    if [[ "$enabled" == "true" ]]; then
      log "disabling distribution $cf"
      jq '.DistributionConfig | .Enabled = false' "$cfg" > "$cfg.new"
      aws_ cloudfront update-distribution --id "$cf" --if-match "$etag" \
        --distribution-config "file://$cfg.new" >/dev/null
    fi
    rm -f "$cfg" "$cfg.new"
    st=""
    for i in $(seq 1 22); do
      st="$(awst cloudfront get-distribution --id "$cf" --query 'Distribution.Status')"
      [[ "$st" == "Deployed" ]] && break
      sleep 10
    done
    if [[ "$st" == "Deployed" ]]; then
      etag="$(awst cloudfront get-distribution --id "$cf" --query ETag)"
      aws_ cloudfront delete-distribution --id "$cf" --if-match "$etag"
      log "deleted distribution $cf"
      state_del distribution; state_del cloudfront_domain
      cf=""
    else
      log "distribution $cf is still $st; the rest is torn down now, run down again to delete it"
    fi
  fi

  # 2. instance, then the Elastic IP and security group it was using
  id="$(find_instance)"
  if [[ -n "$id" ]]; then
    log "terminating $id"
    aws_ ec2 terminate-instances --instance-ids "$id" >/dev/null
    aws_ ec2 wait instance-terminated --instance-ids "$id"
  fi
  state_del instance
  alloc="$(find_eip_alloc)"
  if [[ -n "$alloc" ]]; then
    log "releasing Elastic IP $alloc"
    aws_ ec2 release-address --allocation-id "$alloc"
  fi
  state_del eip_allocation; state_del eip; state_del eip_dns
  vpc="$(default_vpc)"
  sg="$(find_sg "$vpc")"
  if [[ -n "$sg" ]]; then
    log "deleting security group $sg"
    aws_ ec2 delete-security-group --group-id "$sg" >/dev/null
  fi
  state_del security_group; state_del vpc

  # 3. IAM
  if aws_ iam get-instance-profile --instance-profile-name "$SERVER_NAME" >/dev/null 2>&1; then
    aws_ iam remove-role-from-instance-profile --instance-profile-name "$SERVER_NAME" \
      --role-name "$SERVER_NAME" 2>/dev/null || true
    aws_ iam delete-instance-profile --instance-profile-name "$SERVER_NAME"
    log "deleted instance profile $SERVER_NAME"
  fi
  if aws_ iam get-role --role-name "$SERVER_NAME" >/dev/null 2>&1; then
    aws_ iam detach-role-policy --role-name "$SERVER_NAME" --policy-arn "$SSM_POLICY_ARN" 2>/dev/null || true
    aws_ iam delete-role-policy --role-name "$SERVER_NAME" --policy-name "$NAME-app" 2>/dev/null || true
    aws_ iam delete-role --role-name "$SERVER_NAME"
    log "deleted role $SERVER_NAME"
  fi
  state_del role; state_del instance_profile

  # 4. data: table and artifact bucket
  if aws_ dynamodb describe-table --table-name "$TABLE" >/dev/null 2>&1; then
    aws_ dynamodb delete-table --table-name "$TABLE" >/dev/null
    log "deleted table $TABLE"
  fi
  state_del table
  if aws_ s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
    aws_ s3 rm "s3://$BUCKET" --recursive --quiet
    aws_ s3api delete-bucket --bucket "$BUCKET"
    log "deleted bucket $BUCKET"
  fi
  state_del bucket

  if [[ -n "$cf" ]]; then
    echo "down incomplete: distribution $cf is still disabling, run ./deploy.sh down again"
    return 2
  fi
  rm -f "$STATE"
  echo "down complete"
}

case "${1:-}" in
  up) cmd_up ;;
  push) cmd_push ;;
  status) cmd_status ;;
  wait-cdn) cmd_wait_cdn ;;
  down) cmd_down ;;
  *) sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 64 ;;
esac
