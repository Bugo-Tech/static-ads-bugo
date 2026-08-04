/**
 * Default brand config for the **Pet Tag** product (dog flea/bedbug protection
 * pendant). Completely isolated from the main Bugo brand config — has its own
 * storage path (uploads/pet-tag/brand-config.json) and its own type.
 *
 * The user will fill in real values via the /pet-tag/brand UI + upload a brand
 * book PDF. These defaults are placeholders so the system has something to
 * render before that upload happens.
 */

export interface PetTagProductImage {
  /** "product" = device shot, "packaging" = box/pouch shot, or user-uploaded extra */
  id: string;
  /** Stored filename under uploads/pet-tag-products/ */
  filename: string;
  /** Served via /api/pet-tag/products/file/<filename> */
  url: string;
  /** Display label in the UI ("product" / "packaging" / custom) */
  label: string;
  uploadedAt: string;
}

export interface PetTagBrandConfig {
  productName: string;
  tagline: string;
  website: string;
  socialLinks: { platform: string; url: string }[];
  productSpecs: {
    technology: string;
    mechanism: string;
    coverage: string;
    lifespan: string;
    safety: string;
    application: string;
  };
  pricing: {
    single: string;
    bundle: string;
  };
  pricingUS: {
    single: string;
    bundle: string;
  };
  painPoints: string[];
  marketingAngles: string[];
  voiceAndTone: string;
  pestTypes: string[];
  visualIdentity: {
    primaryColor: string;
    accentColor: string;
    fonts: string;
  };
  legalDisclaimers: string[];
  /** Markdown / plain-text dump of the brand book PDF (Hebrew market) */
  brandBookContent: string;
  /** Markdown / plain-text dump of the brand book PDF (US market) */
  brandBookContentUS: string;
  customNotes: string;
}

export const defaultPetTagBrandConfig: PetTagBrandConfig = {
  productName: "Bugo Pet Tag",
  tagline: "הגנה רציפה לכלב שלך — בלי כימיקלים, בלי טיפות, בלי לחשוב על זה.",
  website: "",
  socialLinks: [],
  productSpecs: {
    technology: "תליון הגנה אקטיבי לכלבים נגד פרעושים, קרציות ופשפשים. מתחבר ישירות לקולר הכלב.",
    mechanism: "פליטת תדרים נמוכים שמרחיקים את הטפילים ממוקד החום של הכלב מבלי לפגוע בו או בסביבה.",
    coverage: "טבעת הגנה של כ-1.5 מטר סביב הכלב, פעילה 24/7 כל עוד התליון מורכב.",
    lifespan: "סוללה לכ-12 חודשים. ללא תחזוקה.",
    safety: "ללא כימיקלים, ללא רעלים, ללא ריח. בטוח לחלוטין לכלבים, חתולים, ילדים ובני אדם.",
    application: "מחברים לקולר הקיים. אין צורך להוריד בזמן רחצה (עמיד למים).",
  },
  pricing: {
    single: "",
    bundle: "",
  },
  pricingUS: {
    single: "",
    bundle: "",
  },
  painPoints: [
    "טיפות נגד פרעושים שכימיקליות, מסריחות, ולא תמיד עובדות.",
    "קרציה אחת — נסיעה לווט, בדיקת מחלות, חרדה.",
    "פרעושים שמגיעים גם הביתה, על השטיח, על המיטה, על הילדים.",
    "קולרים כימיים יקרים שדורשים החלפה כל חודש.",
  ],
  marketingAngles: [
    "תפסיק לשפוך כימיקלים על הכלב שלך.",
    "טבעת הגנה של 1.5 מטר — בלי טיפות, בלי קולרים כימיים.",
    "קרציה אחת = 3,000 ש\"ח אצל הווט. תליון אחד = מניעה.",
    "12 חודשי שקט. בלי לזכור לחדש כל חודש.",
    "בטוח גם לילדים שמלטפים את הכלב.",
  ],
  voiceAndTone: `חם, אכפתי, מקצועי. מדבר אל בעלי הכלב כאל הורה שדואג לחיה שלו.
לא מבטיח נסים — מבטיח שקט נפשי. עובדות יבשות (12 חודשים, ללא כימיקלים, עמיד למים) במקום סופרלטיבים.
אמפתי לבעיה: יודע שטיפות מסריחות, שקרציות מפחידות, שהכלב לא אוהב טיפול חודשי.`,
  pestTypes: [
    "פרעושים",
    "קרציות",
    "פשפשי מיטה",
    "יתושים",
  ],
  visualIdentity: {
    primaryColor: "#2D6A4F",
    accentColor: "#FFB703",
    fonts: "Discovery / Heebo / Assistant for Hebrew",
  },
  legalDisclaimers: [
    "התוצאות משתנות לפי סביבת הכלב, רמת הנגיעות באזור ומשך החשיפה. התוצאות אינן מובטחות.",
    "מומלץ להמשיך בבדיקת קרציות שגרתית לאחר טיולים בטבע, גם בנוכחות התליון.",
    "התליון אינו מחליף טיפול ווטרינרי במקרים של נגיעות חמורה או מחלה.",
    "המוצר בטוח לכלבים, חתולים, וילדים. בטרם שימוש בכלבלבים מתחת לגיל 3 חודשים, יש להתייעץ עם וטרינר.",
  ],
  brandBookContent: "",
  brandBookContentUS: "",
  customNotes: "",
};
