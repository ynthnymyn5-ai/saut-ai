export const CURRENCY = "KWD";

/** Kuwaiti dinar prices are shown with three decimals (1 KWD = 1,000 fils). */
export const formatPrice = (n: number) => n.toFixed(3);

export type Product = {
  id: string;
  index: string;
  name: string;
  short: string;
  tagline: string;
  description: string;
  notes: string[];
  spec: { label: string; value: string }[];
  price: number;
  size: string;
  hue: string;
};

export const products: Product[] = [
  {
    id: "signature",
    index: "01",
    name: "MMR SIGNATURE",
    short: "Signature",
    tagline: "The original. Uncompromising.",
    description: "Rich espresso with chocolate and caramel notes.",
    notes: ["Dark chocolate", "Burnt caramel", "Black cherry"],
    spec: [
      { label: "Dose", value: "18 g" },
      { label: "Yield", value: "36 g" },
      { label: "Time", value: "28 s" },
    ],
    price: 2.5,
    size: "Double ristretto · 40 ml",
    hue: "#c08a5b",
  },
  {
    id: "velvet",
    index: "02",
    name: "MMR VELVET",
    short: "Velvet",
    tagline: "Silk, poured slowly.",
    description: "Smooth specialty latte with silky milk texture.",
    notes: ["Honeyed milk", "Toasted hazelnut", "Vanilla bean"],
    spec: [
      { label: "Milk", value: "62 °C" },
      { label: "Microfoam", value: "8 mm" },
      { label: "Volume", value: "220 ml" },
    ],
    price: 1.95,
    size: "Latte · 220 ml",
    hue: "#efe6d8",
  },
  {
    id: "gold",
    index: "03",
    name: "MMR GOLD",
    short: "Gold",
    tagline: "Reserved for the few.",
    description: "Exclusive premium coffee with a luxurious flavor profile.",
    notes: ["Jasmine", "Bergamot", "Wild honey"],
    spec: [
      { label: "Altitude", value: "2,100 m" },
      { label: "Process", value: "Anaerobic" },
      { label: "Lot", value: "Numbered" },
    ],
    price: 12,
    size: "Reserve beans · 250 g",
    hue: "#d6b37a",
  },
  {
    id: "coldbrew",
    index: "04",
    name: "MMR COLD BREW",
    short: "Cold Brew",
    tagline: "Patience, bottled.",
    description: "Slow-brewed coffee with a refreshing finish.",
    notes: ["Cacao nib", "Orange zest", "Brown sugar"],
    spec: [
      { label: "Steep", value: "18 h" },
      { label: "Temp", value: "4 °C" },
      { label: "Bottle", value: "330 ml" },
    ],
    price: 2.25,
    size: "Bottle · 330 ml",
    hue: "#7a4a2b",
  },
];

export type Drink = {
  name: string;
  description: string;
  price: number;
  /** Visual recipe for the generated illustration */
  look: { vessel: "cup" | "glass" | "tall" | "espresso"; liquid: string; top: string; art?: "heart" | "tulip" | "rosetta" | "none"; ice?: boolean; garnish?: string };
};

export const menu: { id: string; label: string; intro: string; items: Drink[] }[] = [
  {
    id: "hot",
    label: "Hot Coffee",
    intro: "Pulled at 93 °C on a dual-boiler machine, served within ninety seconds.",
    items: [
      { name: "Espresso", description: "Single origin, 18 g in, 36 g out. Thick hazelnut crema.", price: 1.25, look: { vessel: "espresso", liquid: "#2a1409", top: "#b57a45", art: "none" } },
      { name: "Cortado", description: "Equal parts espresso and warm milk. Short and balanced.", price: 1.5, look: { vessel: "glass", liquid: "#6b3f22", top: "#e6d3b8", art: "heart" } },
      { name: "Flat White", description: "Double ristretto under a thin veil of microfoam.", price: 1.75, look: { vessel: "cup", liquid: "#5a3319", top: "#efe2cc", art: "tulip" } },
      { name: "Velvet Latte", description: "Our house latte with honeyed, silky milk.", price: 1.95, look: { vessel: "cup", liquid: "#7a4a2b", top: "#f2e7d6", art: "rosetta" } },
    ],
  },
  {
    id: "iced",
    label: "Iced Coffee",
    intro: "Chilled without dilution. Clear ice, cut by hand every morning.",
    items: [
      { name: "Iced Americano", description: "Double espresso over clear ice and cold filtered water.", price: 1.5, look: { vessel: "tall", liquid: "#3a1f10", top: "#3a1f10", ice: true } },
      { name: "Iced Velvet", description: "Espresso layered over cold, sweetened milk.", price: 2, look: { vessel: "tall", liquid: "#c9a27c", top: "#4a2814", ice: true } },
      { name: "Cold Brew Tonic", description: "18-hour cold brew over tonic and an orange twist.", price: 2.25, look: { vessel: "tall", liquid: "#8a4b22", top: "#a35f2c", ice: true, garnish: "#e08a2e" } },
      { name: "Shakerato", description: "Espresso shaken hard with ice until it foams.", price: 1.75, look: { vessel: "glass", liquid: "#3d2212", top: "#c9925a", art: "none" } },
    ],
  },
  {
    id: "signature",
    label: "Signature Drinks",
    intro: "Recipes developed in-house. Available only at MMR.",
    items: [
      { name: "MMR Signature", description: "Double ristretto with chocolate and caramel notes.", price: 2.5, look: { vessel: "espresso", liquid: "#1f0f07", top: "#c08a5b", art: "none" } },
      { name: "Gold Leaf Mocha", description: "Single-origin cacao, espresso and a sheet of edible gold.", price: 3.5, look: { vessel: "cup", liquid: "#3b1d0e", top: "#5a2f16", garnish: "#d6b37a" } },
      { name: "Smoked Maple Latte", description: "Oak-smoked maple, espresso and steamed milk.", price: 2.75, look: { vessel: "cup", liquid: "#7d4a28", top: "#ead9bf", art: "heart" } },
      { name: "Midnight Tonic", description: "Cold brew, black tonic and a rosemary mist.", price: 2.5, look: { vessel: "tall", liquid: "#1a0e08", top: "#2a160b", ice: true, garnish: "#6c8a5a" } },
    ],
  },
  {
    id: "specialty",
    label: "Specialty Collection",
    intro: "Rare micro-lots brewed by hand. Changes with the harvest.",
    items: [
      { name: "Geisha Pour-Over", description: "Panama, washed. Jasmine, bergamot, white peach.", price: 4.5, look: { vessel: "glass", liquid: "#9a5523", top: "#b8692c", art: "none" } },
      { name: "Yirgacheffe V60", description: "Ethiopia, natural. Blueberry and lemon tea.", price: 2.75, look: { vessel: "glass", liquid: "#8a4a1f", top: "#a65e28", art: "none" } },
      { name: "Anaerobic Siphon", description: "Colombia. Brewed in glass at the counter. Tropical and syrupy.", price: 3.5, look: { vessel: "cup", liquid: "#6e3818", top: "#8c4a20", art: "none" } },
      { name: "MMR Gold Reserve", description: "Our numbered reserve lot, served as a tasting flight of three.", price: 7.5, look: { vessel: "espresso", liquid: "#2a1409", top: "#d6b37a", art: "none", garnish: "#d6b37a" } },
    ],
  },
];

export const nav = [
  { id: "home", label: "Home" },
  { id: "story", label: "Our Story" },
  { id: "menu", label: "Menu" },
  { id: "experience", label: "Experience" },
  { id: "contact", label: "Contact" },
];

/** Replace these with the brand's real profiles, address and policy page. */
export const links = [
  { label: "Instagram", href: "https://instagram.com/" },
  { label: "TikTok", href: "https://tiktok.com/" },
  { label: "Contact", href: "#contact" },
  { label: "Location", href: "#contact" },
  { label: "Privacy Policy", href: "#contact" },
];
