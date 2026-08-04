/**
 * Default brand config for the **Bugo Fly** product — a mosquito/fly repeller
 * within the Bugo brand family. Isolated from main Bugo + pet-tag.
 *
 * Storage: uploads/fly/brand-config.json
 */

export interface FlyProductImage {
  id: string;
  filename: string;
  url: string;
  label: string;
  uploadedAt: string;
}

export interface FlyBrandConfig {
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
  brandBookContent: string;
  brandBookContentUS: string;
  customNotes: string;
}

export const defaultFlyBrandConfig: FlyBrandConfig = {
  productName: "Bugo Fly",
  tagline: "סוף ליתושים ולזבובים — בבית, בחצר, בלי כימיקלים.",
  website: "",
  socialLinks: [],
  productSpecs: {
    technology: "מכשיר Bugo Fly להרחקת יתושים, זבובים וחרקים מעופפים. שקט, בטוח, בלי כימיקלים ובלי ריח.",
    mechanism: "שילוב של גלי אולטראסאונד בתדרים שיתושים וזבובים נמנעים מהם, ומעגל הגנה מולטי-חרקי שמכסה את החלל סביב המכשיר.",
    coverage: "עד 40 מ\"ר ליחידה — חדר שינה גדול, סלון, מרפסת או חצר קטנה.",
    lifespan: "פעולה רציפה 24/7. ללא תחזוקה, ללא החלפת חומרים.",
    safety: "בלי כימיקלים, בלי רעלים, בלי ריח. בטוח לחלוטין לילדים, לתינוקות ולחיות מחמד.",
    application: "מחברים לשקע ושוכחים. המכשיר מתחיל לעבוד מיידית.",
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
    "יתושים שמעירים אותך באמצע הלילה עם זמזום וצקיצות.",
    "ילדים שמתעוררים עקוצים, עם פצעי גירוד שצריך לטפל בהם בבוקר.",
    "זבובים שמסתובבים סביב האוכל ועל המשטחים — תחושת חוסר נקיון.",
    "ספריי דוחה כימיקלי, ריח חזק, ספריי על העור של הילד.",
    "סלילים שמעשנים, נר ציטרונלה שלא תמיד עובד, חשמלית שמתפוצצת חרקים.",
    "מרפסת/חצר שלא נהנים ממנה בלילה כי היתושים תוקפים.",
  ],
  marketingAngles: [
    "שינה בלי זמזום — סוף לליל הלבן עם יתוש בחדר.",
    "ילדים בלי עקיצות בבוקר — בלי כימיקלים על העור שלהם.",
    "מרפסת שאפשר לשבת בה — בלי לאכול את כל היתושים של השכונה.",
    "סוף לזבובים שמסתובבים סביב האוכל.",
    "מכשיר אחד, חיבור לשקע, ושוכחים.",
    "לעומת ספריי/סלילים — לא צריך להחליף כלום, לא צריך לרסס, לא צריך ריח.",
  ],
  voiceAndTone: `חם, אכפתי ומקצועי. מדבר אל ההורה/בעל הבית שדואג לבריאות הילדים והשקט בבית.
לא מבטיח נסים — מבטיח שקט נפשי. עובדות יבשות (40 מ"ר, 24/7, ללא כימיקלים) במקום סופרלטיבים.
אמפתי: יודע שהיתושים מעצבנים, שהילדים מתעוררים מקריצים, שהזבובים סביב האוכל הם תחושה לא נעימה.`,
  pestTypes: [
    "יתושים",
    "זבובים",
    "יתושוני חול",
    "פרעוש",
    "פשפש מיטה",
  ],
  visualIdentity: {
    primaryColor: "#0266FE",
    accentColor: "#00BFA5",
    fonts: "Discovery / Heebo / Assistant for Hebrew",
  },
  legalDisclaimers: [
    "התוצאות משתנות לפי תנאי הסביבה, מספר היתושים באזור ומיקום המכשיר. התוצאות אינן מובטחות.",
    "המוצר מיועד לסיוע בהרחקת יתושים וזבובים, ואינו תחליף לטיפול מקצועי בנגיעות חמורה.",
    "בטוח לשימוש בקרבת ילדים, תינוקות וחיות מחמד. אין צורך להוציא את המכשיר בעת השימוש.",
  ],
  brandBookContent: "",
  brandBookContentUS: "",
  customNotes: "",
};
