/**
 * Default brand config for the **Bugo Guard** product — sachets of concentrated
 * essential oils that repel mice and rodents. Isolated from main Bugo + Birds +
 * Fly + Ants + Pet Tag.
 *
 * Unlike every other vertical in this app, Guard is NOT an electronic device:
 * it is a flat sachet placed inside an enclosed space. Anything describing a
 * plug, speaker, LED or mounting bracket does not apply here.
 *
 * Storage: references/brand-config/guard.json (Supabase)
 */

export interface GuardProductImage {
  id: string;
  filename: string;
  url: string;
  label: string;
  uploadedAt: string;
}

export interface GuardBrandConfig {
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

export const defaultGuardBrandConfig: GuardBrandConfig = {
  productName: "Bugo Guard",
  tagline: "לראשונה בישראל — הדברה ביתית בלי כימיקלים ובלי מדבירים.",
  website: "https://bugo.co.il/products/bugo-guard",
  socialLinks: [],
  productSpecs: {
    technology:
      "שקיקי Bugo Guard להרחקת עכברים ומכרסמים מארונות מטבח, מזווה, מחסן, עליית גג, תא מנוע ברכב וקראוון. בלי חשמל, בלי הרכבה, בלי מלכודות.",
    mechanism:
      "כל שקיק מפזר תערובת שמנים אתריים בריכוז גבוה — מנטה, קינמון, ארז ושמן קיק. מכרסמים מנווטים ומאתרים מזון לפי חוש הריח, והריח החזק בחלל סגור הופך את המקום ללא מזמין. המוצר אינו פוגע בהם — הם פשוט בוחרים ללכת למקום אחר.",
    coverage:
      "12 שקיקים בכל אריזה. שקיק אחד לכל חלל סגור שרוצים להגן עליו — ארון, מגירה, מזווה, ארגז אחסון.",
    lifespan:
      "בין 30 ל-90 יום, תלוי בסביבה. בחלל סגור וקריר הריח נשמר לאורך זמן; בחלל מאוורר או חם הוא מתפוגג מהר יותר. כשהריח נחלש — זה הסימן להחליף.",
    safety:
      "שמנים אתריים בלבד. בלי רעל, בלי חומרי הדברה, בלי מלכודות ובלי קפיצים. בטוח לשימוש בבית עם ילדים ועם חיות מחמד. מומלץ להניח מחוץ להישג ידם של פעוטות, כמו כל מוצר מבושם. השקיק המשומש הוא חומר צמחי וניתן להשליכו לפח הרגיל.",
    application:
      "מוציאים שקיק מהשקית האטומה (השאר נשארים סגורים), מניחים בחלל הסגור שרוצים להגן עליו, ומחליפים כשהריח נחלש. בלי התקנה ובלי תחזוקה.",
  },
  pricing: {
    single: "₪99 לאריזה של 12 שקיקים (במקום ₪149).",
    bundle: "2 אריזות ₪169 · 3 אריזות ₪229 (הכי פופולרי) · 4 אריזות ₪279.",
  },
  pricingUS: {
    single: "",
    bundle: "",
  },
  painPoints: [
    "גללים בארון המטבח ובמזווה — לא יודעים מה נגעו בו ומה כבר לא בטוח לאכול.",
    "אריזות מזון מכורסמות, שקיות קרועות, אורז ופסטה על הרצפה.",
    "חוטי חשמל מכורסמים ברכב ובעליית הגג — נזק יקר ומסוכן.",
    "לא מוכנים לפזר רעל בבית שיש בו ילדים או חיות מחמד.",
    "מלכודות זה סיוט — צריך לאסוף גופות, וזה חוזר שוב אחרי כמה ימים.",
    "מדביר עולה מאות שקלים, ואחרי חודשיים הבעיה חוזרת.",
  ],
  marketingAngles: [
    "בית מוגן בלי טיפת רעל — בטוח לילדים ולחיות מחמד.",
    "בלי גופות לנקות ובלי מלכודות לאפס — פשוט מניחים ושוכחים.",
    "מניחים בארון, במזווה, במחסן וברכב — הגנה בכל מקום סגור.",
    "12 שקיקים באריזה, מוכנים לשימוש — בלי חשמל ובלי הרכבה.",
    "מונע במקום לטפל — עוצר את הבעיה לפני שהיא הופכת לנגיעות.",
    "עד 90 יום לשקיק — הגנה שקטה שלא צריך לחשוב עליה.",
  ],
  voiceAndTone: `רגוע, מעשי ומרגיע. מדבר אל בעל הבית שגילה גללים בארון או אריזת מזון מכורסמת, ומרגיש גועל וחוסר שליטה.
לא מבטיח השמדה — מבטיח הרחקה. עובדות יבשות (12 שקיקים, 30-90 יום, שמנים אתריים בלבד) במקום סופרלטיבים.
אמפתי: יודע שהלקוח כבר ניסה מלכודות ורעל, ושהוא לא רוצה את שניהם בבית עם ילדים או חיות.
נמנע מתמונות מבחילות של מכרסמים — המיקוד הוא בבית הנקי והמוגן, לא במזיק.`,
  pestTypes: ["עכברים", "מכרסמים", "חולדות"],
  visualIdentity: {
    primaryColor: "#7C3AED",
    accentColor: "#1E293B",
    fonts: "Discovery / Heebo / Assistant for Hebrew",
  },
  legalDisclaimers: [
    "התוצאות משתנות לפי גודל החלל, מידת האוורור, וכמות המכרסמים באזור. התוצאות אינן מובטחות.",
    "אם כבר קיימת נגיעות פעילה בבית נדרש טיפול מקצועי. המוצר מיועד להרחקה ולמניעה, ואינו תחליף לטיפול של חברת הדברה בנגיעות קיימת.",
    "המוצר אינו פוגע במכרסמים — רק מרחיק אותם. מכיל שמנים אתריים בלבד, בלי רעל ובלי חומרי הדברה.",
    "אחריות והחזרות: 30 יום ממועד קבלת המוצר, כשהמוצר סגור, לא נפתח ולא נעשה בו שימוש, באריזתו המקורית ועם החשבונית. דמי ביטול 5% מערך המוצר או ₪100 (הנמוך מביניהם). עלות משלוח ההחזרה חלה על הלקוח. במוצר פגום — החזר כספי מלא בכפוף לאימות התקלה.",
  ],
  brandBookContent: "",
  brandBookContentUS: "",
  customNotes: "",
};
