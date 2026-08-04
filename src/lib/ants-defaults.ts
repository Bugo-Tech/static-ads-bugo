/**
 * Default brand config for the **Bugo Ants** product — a passive gel bait
 * ant trap that eliminates the entire colony including the queen. Isolated
 * from main Bugo + Fly + Pet Tag + Birds + Native Ads.
 *
 * Storage: uploads/ants/brand-config.json
 */

export interface AntsProductImage {
  id: string;
  filename: string;
  url: string;
  label: string;
  uploadedAt: string;
}

export interface AntsBrandConfig {
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

export const defaultAntsBrandConfig: AntsBrandConfig = {
  productName: "Bugo Ants",
  tagline: "מלכודת הג'ל החכמה שמחסלת את כל המושבה — כולל המלכה.",
  website: "",
  socialLinks: [],
  productSpecs: {
    technology: "מכשיר Bugo Ants — תחנות פיתיון ג'ל אטומות עם פורמולה מבוססת בורקס (מינרל טבעי) + סירופ מתוק. הנמלים נמשכות, אוכלות, ונושאות את הפיתיון חזרה לקן שלהן.",
    mechanism: "הנמלים אוכלות את הפיתיון ומחזירות אותו לקן. שם הפיתיון מתפזר לכל המושבה — כולל המלכה. המושבה מתחסלת מבפנים תוך ימים ספורים.",
    coverage: "מומלץ 3-5 תחנות ל-10 מ\"ר. חבילה של 4 תחנות מספיקה לדירה ממוצעת. חבילת 16 תחנות לבית פרטי.",
    lifespan: "פועל עד שהמושבה מתחסלת (~שבוע). לא צריך להחליף — פשוט לזרוק את התחנה אחרי סיום.",
    safety: "בטוח לחלוטין לילדים ולחיות מחמד — תחנות פלסטיק אטומות, בלי טפטוף, בלי נגיעה בפיתיון. בורקס = מינרל טבעי שנמצא בסבונים, משחות שיניים ומוצרי ניקוי ביתיים.",
    application: "שוברים לשונית → מניחים ליד השביל של הנמלים (מתחת לכיור, פינת מטבח, ליד מקרר) → שוכחים. שום דבר לא צריך לעשות.",
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
    "נמלים במטבח מכסות את השיש בשניות — אתה לא מספיק לצחצח שיניים.",
    "פותחים קופסת דגני בוקר — מלאה בנמלים. הכל לפח.",
    "שברי סוכר במגירה = הזמנה לכל השכונה של נמלים.",
    "ריסוסים לא עובדים — הן חוזרות תוך יום, אבל עם הריח של הכימיקלים בבית.",
    "פחד שהילד יזחל על הרצפה איפה שרוססתם רעל בבוקר.",
    "מדבירים עולים ₪400 לביקור — וזה חוזר בעוד חודשיים.",
    "שבילי פרומונים על השיש — נמלים חדשות עוקבות בדיוק אחרי אותו מסלול.",
  ],
  marketingAngles: [
    "לא רק דוחה — מחסל את הקן מהשורש. המלכה מתה, כל המושבה איתה.",
    "בורקס = מינרל טבעי. בטוח לילדים ולכלב, קטלני לנמלים.",
    "תחנה אטומה — בלי טפטוף, בלי לכלוך, בלי לגעת בפיתיון.",
    "פסיבי — בלי חשמל, בלי סוללה, בלי רעש, בלי החלפה של סוללות.",
    "שברו את הלשונית והניחו. Bugo עושה את השאר.",
    "24-48 שעות עד שהנמלים נעלמות — ותוך שבוע המושבה מחוסלת.",
    "לעומת ריסוסים ומדבירים — פעם אחת ונגמר. לא מנוי חודשי.",
  ],
  voiceAndTone: `חם, ידידותי, פרקטי. מדבר אל אמא/אבא שנלחמים על השליטה במטבח.
יודע שנמלים בישראל בקיץ = טירוף — סוכר לא סגור = טרגדיה תוך שעה.
עובדות יבשות (מינרל טבעי, ₪89, תוצאות תוך יומיים) במקום סופרלטיבים.
לא מבטיח נסים — מבטיח פתרון פסיבי אמין לבתים ולמשפחות.
אמפתי: יודע שריסוסים לא עובדים ושמדביר יקר. יודע שילדים על הרצפה.`,
  pestTypes: [
    "נמלים שחורות",
    "נמלי סוכר",
    "נמלי בית",
    "נמלי מדרכה",
    "נמלי רפאים",
    "נמלים אדומות",
  ],
  visualIdentity: {
    primaryColor: "#C2410C",
    accentColor: "#0F172A",
    fonts: "Discovery / Heebo / Assistant for Hebrew",
  },
  legalDisclaimers: [
    "התוצאות משתנות לפי גודל אוכלוסיית הנמלים, סוג הנמלים והסביבה. תוצאות טיפוסיות תוך 24-48 שעות בהתפשטות קטנה, עד שבועיים בהתפשטות גדולה. התוצאות אינן מובטחות.",
    "המוצר מכיל בורקס ואימידאקלופריד — יש להניח מחוץ להישג יד של ילדים קטנים וחיות מחמד. אין לפתוח את התחנה או לגעת בפיתיון עצמו.",
    "המוצר מיועד להדברת נמלים ביתיות. עבור נגיעות חמורה, פלישה של נמלי אש או מספר גדול של מקננים — יש להיעזר בחברת הדברה מקצועית.",
  ],
  brandBookContent: "",
  brandBookContentUS: "",
  customNotes: "",
};
