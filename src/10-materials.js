// ───────────────────────── materials ─────────────────────────
// Every block is one of these. style: 0 plain, 1 punched windows, 2 glass
// curtain wall, 3 window bands, 4 glass with vertical fins, 5 grass over dirt,
// 6 leaves, 7 light, 8 sign (lit like paint by day, glows at night).
// b is the roof colour of a building, or the second colour of the style.
const MAT = [null];
const M = (name, col, style = 0, b = col, p = 0) => { MAT.push({ id: MAT.length, name, col: lin(col), style, b: lin(b), p }); return MAT.length - 1; };

// ground and plants
const GRASS = M("grass", "#52763a", 5, "#7a5a3a"), SAND = M("sand", "#dccf9c"), STONE = M("stone", "#8b8d8c"),
  ASPHALT = M("asphalt", "#4b4d52"), PAVE = M("pavement", "#b9b6ad"), TRUNK = M("trunk", "#5d4630"),
  LEAF_A = M("leaves", "#356528", 6), LEAF_B = M("leaves", "#4a7430", 6), LEAF_C = M("leaves", "#2c5632", 6),
  CYPRESS = M("cypress", "#24492c", 6), PALM = M("palm", "#4f7f35", 6),
  QUAY = M("quay", "#a9a79f"), DIRT = M("dirt", "#7a5a3a"), DECK = M("road deck", "#55585e"),
  LAWN = M("lawn", "#5f8a3e", 5, "#7a5a3a"), PLANK = M("pier planks", "#8a6a48"), PILE = M("pier pile", "#4d3b2a");

// the city's ordinary buildings
const B_WHITE = M("white concrete", "#e7e4dc", 1, "#b8b5ad"), B_SAND = M("sandstone", "#d9c08f", 1, "#a8946d"),
  B_GREY = M("stone", "#a3a6a8", 1, "#7c7f82"), B_TERRA = M("terracotta", "#b9654a", 1, "#7d4634"),
  B_TAN = M("tan brick", "#c9a37a", 3, "#8f7355"), B_BLUE = M("blue glass", "#8fa9bd", 2, "#6c7f8e"),
  B_TEAL = M("teal glass", "#86b3ac", 2, "#62837e"), B_DARK = M("dark glass", "#3d4650", 2, "#2c3239"),
  B_QUARTZ = M("quartz", "#f1eee6", 3, "#cfcbc0"), B_BRICK = M("brick", "#a5503c", 1, "#6d6f72"),
  B_CREAM = M("cream", "#eadcc0", 3, "#b5a88f"), B_SLATE = M("slate", "#7f8fa6", 1, "#5d6a7c"),
  B_SILVER = M("silver glass", "#aebfcc", 4, "#8796a1"), B_BRONZE = M("bronze glass", "#8d7a66", 2, "#5e5246");
const TOWER_MATS = [B_WHITE, B_SAND, B_GREY, B_TAN, B_BLUE, B_BLUE, B_TEAL, B_DARK, B_QUARTZ, B_CREAM, B_SLATE, B_SILVER, B_BRONZE];
const MID_MATS = [B_BRICK, B_TAN, B_WHITE, B_GREY, B_TERRA, B_CREAM, B_DARK, B_SAND, B_SLATE];

// row houses: pastel walls under a roof of the same colour, a shade down
const shade = (hex, k) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0")).join("");
const PASTELS = [["#d9837f", "pink"], ["#7fa6cf", "sky blue"], ["#e3c35e", "butter"], ["#86c3a0", "mint"], ["#a58fcf", "lavender"],
  ["#e7a36a", "peach"], ["#e6d6ae", "cream"], ["#9db57f", "sage"], ["#dcd8cd", "white"], ["#cf7566", "salmon"], ["#6fb0a8", "seafoam"], ["#d6b47f", "sand"]]
  .map(([c, n]) => M(n + " house", c, 1, shade(c, 0.74)));
const TRIM = M("white trim", "#fbf8f0"), SHINGLE = M("roof shingle", "#55565e"), STEP = M("steps", "#cfc9bc");

// landmarks
const IORANGE = M("international orange", "#b22a20"), CONCRETE = M("concrete", "#b7b3a8"),
  SALESF = M("tower glass", "#b9cfdd", 4, "#9fb3c0"), CROWN = M("tower crown", "#e6f1f8", 8, "#dfeeff", 1.6),
  TRANS = M("pyramid quartz", "#efede7", 3, "#efede7"), PALACE = M("palace stone", "#dab48a"), DOME = M("palace dome", "#b1623a"),
  COIT = M("coit concrete", "#efe9dc"), SUTRO_R = M("tower red", "#c8402f"), SUTRO_W = M("tower white", "#f2f0ea"),
  FERRY = M("ferry sandstone", "#e3ddd0", 1, "#8f9a97"), SHED = M("pier shed", "#e8e2d4", 0), SHED_ROOF = M("pier roof", "#73838a"),
  CLOCK = M("clock face", "#fff7df", 8, "#ffd98a", 1.3), HULL = M("hull", "#f4f4f1"), HULL_B = M("hull blue", "#2f5d86");

// signs and the tech scene
const YC_ORANGE = M("yc orange", "#f26522"), NV_GREEN = M("nvidia green", "#76b900"), SIGN_WHITE = M("sign white", "#ffffff", 8, "#fff3d6", 1.1),
  SIGN_BLACK = M("sign black", "#141414"), CRANE = M("crane", "#f0b323"), SITE = M("new glass", "#f0b98a", 2, "#b98c66"),
  LIGHT = M("light", "#fff1c9", 7, "#ffe2a0", 3);

// animals and vehicles
const FUR = M("corgi", "#b9601f"), FUR_W = M("white fur", "#e9e3d6"), BLACK = M("black", "#17171a"), GULL_G = M("gull grey", "#9aa0a6"),
  BEAK = M("beak", "#f0a923"), SEALION = M("sea lion", "#6b4a35"), CAR_W = M("car white", "#f4f4f1"), CAR_GLASS = M("car glass", "#20262c"),
  CABLE_R = M("cable car red", "#8f2a22"), CABLE_C = M("cable car cream", "#ead9b0"), BRASS = M("brass", "#d2a53c"),
  CAR_Y = M("car yellow", "#e9b930"), CAR_B = M("car blue", "#3d6f9e"), SAIL = M("sail", "#fbfaf5"), TONGUE = M("tongue", "#e58a9a");

// people and pets. A look is [skin, shirt, trousers, hair, hair style, extra]; the server holds the same counts.
const SKINS = ["#f3d2b3", "#e2b58c", "#c98f5e", "#9c6a3f", "#6b4326", "#f7e0cc"].map((c) => M("skin", c));
const SHIRTS = ["#e8e6e1", "#27323d", "#c0392b", "#2e6fb7", "#3f8f5a", "#e2a72e", "#7a4fb0", "#e07a9a", "#5a646e", "#f26522", "#1f8a8a", "#d9d2c0"].map((c) => M("shirt", c));
const PANTS = ["#2b3442", "#3f5676", "#6b6f76", "#b9a98a", "#1c1d21", "#5a4634"].map((c) => M("trousers", c));
const HAIRS = ["#1b1512", "#4a3020", "#8a5a2c", "#d9b36a", "#b8b8b8", "#a8402a"].map((c) => M("hair", c));
const VEST = M("vest", "#565d66"), CUP = M("cup", "#f4f1ea"), BOARD = M("skateboard", "#d98b2b"), CAT_G = M("grey cat", "#8b8f96"), CAT_O = M("orange cat", "#d98a3d"),
  DOG_K = M("black dog", "#2a2625"), DOG_Y = M("yellow dog", "#d9b877"), DOG_B = M("brown dog", "#7a4e2c"), LEASH = M("leash", "#c0392b");
if (MAT.length > 128) throw new Error("too many materials for the material texture: " + MAT.length);
