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
    name: "MMAR SIGNATURE",
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
    name: "MMAR VELVET",
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
    name: "MMAR GOLD",
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
    name: "MMAR COLD BREW",
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
  ar: string;
  description: string;
  descriptionAr: string;
  price: number;
  /** Visual recipe for the generated illustration (used until a real photo is added) */
  look: {
    vessel: "cup" | "glass" | "tall" | "espresso" | "sandwich";
    liquid: string;
    top: string;
    art?: "heart" | "tulip" | "rosetta" | "none";
    ice?: boolean;
    garnish?: string;
  };
};

/** The shop's price list, as printed on the banner in store. Prices in KWD. */
export const menu: { id: string; label: string; labelAr: string; intro: string; introAr: string; items: Drink[] }[] = [
  {
    id: "coffee",
    label: "Coffee",
    labelAr: "قهوة",
    intro: "Espresso-based drinks, made to order.",
    introAr: "مشروبات الإسبريسو، تُحضّر عند الطلب.",
    items: [
      { name: "Espresso", ar: "اسبريسو", description: "A short, concentrated shot.", descriptionAr: "جرعة مركّزة قصيرة.", price: 1.5, look: { vessel: "espresso", liquid: "#2a1409", top: "#b57a45", art: "none" } },
      { name: "Flat White", ar: "فلات وايت", description: "Espresso with a thin layer of steamed milk.", descriptionAr: "إسبريسو مع طبقة رقيقة من الحليب المبخّر.", price: 1.75, look: { vessel: "cup", liquid: "#5a3319", top: "#efe2cc", art: "tulip" } },
      { name: "Spanish Latte", ar: "سبانيش لاتيه", description: "Espresso, milk and sweetened condensed milk.", descriptionAr: "إسبريسو وحليب مع حليب مكثّف محلّى.", price: 1.8, look: { vessel: "glass", liquid: "#8a5a35", top: "#f2e7d6", art: "rosetta" } },
      { name: "Americano", ar: "امريكانو", description: "Espresso lengthened with hot water.", descriptionAr: "إسبريسو مع ماء ساخن.", price: 1.75, look: { vessel: "cup", liquid: "#2e1609", top: "#7a4422", art: "none" } },
    ],
  },
  {
    id: "filter",
    label: "Filter Coffee",
    labelAr: "قهوة مقطرة",
    intro: "Single-origin beans, brewed by hand.",
    introAr: "محاصيل مختصة، تُقطَّر يدوياً.",
    items: [
      { name: "Ethiopian", ar: "أثيوبي", description: "Ethiopian beans, brewed as filter coffee.", descriptionAr: "حبوب إثيوبية، تُحضّر قهوة مقطرة.", price: 2, look: { vessel: "glass", liquid: "#9a5523", top: "#b8692c", art: "none" } },
      { name: "Colombian", ar: "كولومبي", description: "Colombian beans, brewed as filter coffee.", descriptionAr: "حبوب كولومبية، تُحضّر قهوة مقطرة.", price: 2, look: { vessel: "glass", liquid: "#7e4019", top: "#9a5523", art: "none" } },
      { name: "Al Raiba", ar: "الرايبه", description: "Our Al Raiba filter coffee.", descriptionAr: "قهوة الرايبه المقطرة.", price: 2.5, look: { vessel: "glass", liquid: "#6e3818", top: "#8c4a20", art: "none" } },
    ],
  },
  {
    id: "sandwiches",
    label: "Sandwiches",
    labelAr: "سندويشات",
    intro: "Freshly made sandwiches.",
    introAr: "سندويشات طازجة.",
    items: [
      { name: "Egg & Cheese", ar: "بيض جبن", description: "Egg and cheese.", descriptionAr: "بيض مع جبن.", price: 1.35, look: { vessel: "sandwich", liquid: "#e8c15a", top: "#f4dc8a" } },
      { name: "Egg Mayo", ar: "بيض مايونيز", description: "Egg and mayonnaise.", descriptionAr: "بيض مع مايونيز.", price: 1.35, look: { vessel: "sandwich", liquid: "#f1d77a", top: "#fbf1cf" } },
      { name: "Halloumi & Beetroot", ar: "حلوم شمندر", description: "Halloumi with beetroot.", descriptionAr: "حلوم مع شمندر.", price: 1.3, look: { vessel: "sandwich", liquid: "#8e1f3d", top: "#efe6d0" } },
      { name: "Four Cheese", ar: "أربع أجبان", description: "A blend of four cheeses.", descriptionAr: "مزيج من أربعة أجبان.", price: 1.35, look: { vessel: "sandwich", liquid: "#f0c040", top: "#f7e2a0" } },
      { name: "Full Halloumi", ar: "حلوم كامل", description: "Halloumi, served full.", descriptionAr: "حلوم كامل.", price: 1.35, look: { vessel: "sandwich", liquid: "#e9dcc0", top: "#c99a5a" } },
      { name: "Turkey", ar: "تيركي", description: "Turkey sandwich.", descriptionAr: "سندويش تيركي.", price: 1.3, look: { vessel: "sandwich", liquid: "#d9a58a", top: "#efd7c5" } },
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
