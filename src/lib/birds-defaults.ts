/**
 * Default brand config for the **Bugo Birds** product — an ultrasonic pigeon /
 * bird repeller within the Bugo brand family. Isolated from main Bugo + Fly +
 * Pet Tag.
 *
 * Storage: uploads/birds/brand-config.json
 */

export interface BirdsProductImage {
  id: string;
  filename: string;
  url: string;
  label: string;
  uploadedAt: string;
}

export interface BirdsBrandConfig {
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

export const defaultBirdsBrandConfig: BirdsBrandConfig = {
  productName: "Bugo Birds",
  tagline: "המכשיר המוביל בישראל להרחקת יונים — בלי קקי, בלי ריח, בלי מאבק.",
  website: "",
  socialLinks: [],
  productSpecs: {
    technology: "מכשיר Bugo Birds להרחקת יונים וציפורים פולשות ממרפסות, גגות, פאנלים סולאריים, מזגנים וחצרות. שקט לאוזן האנושית, בלי כימיקלים, בלי רעלים.",
    mechanism: "שילוב של גלי אולטראסאונד בתדרים שיונים נמנעים מהם, פלאש LED שמרתיע, וחיישן תנועה שמפעיל את ההגנה אוטומטית כשמתקרבת ציפור.",
    coverage: "עד 60 מ\"ר ליחידה — מרפסת, גג רעפים, מערך פאנלים סולאריים, חצר אחורית.",
    lifespan: "פעולה רציפה 24/7. סוללה נטענת או חיבור לחשמל. ללא תחזוקה.",
    safety: "בלי כימיקלים, בלי קוצים, בלי דקירה. בטוח לחלוטין לבני אדם, לכלבים, לחתולים ולציפורי שיר במרחק. תואם רגולציות הגנה על בעלי חיים — לא פוגע ביונים, רק מרחיק אותן.",
    application: "מתקינים על הקיר/מעקה/גג. מפעילים. שוכחים.",
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
    "צואת יונים מכסה את המרפסת — לא נעים לצאת לשבת או לתלות כביסה.",
    "פאנלים סולאריים מלוכלכים בצואה — איבוד יעילות, צריך לקרוא לחברה לניקוי.",
    "ריח רע ולא מסתדר עם החיים השכנותיים.",
    "מחלות וכינים שיונים מעבירות — סכנה בריאותית לילדים ולחיות.",
    "נזק לרעפים, למזגנים, לתריסים — תיקונים יקרים.",
    "ניסו קוצים, ניסו רשתות, ניסו דחלילים — אף אחד לא עובד באמת לאורך זמן.",
  ],
  marketingAngles: [
    "מרפסת חופשית מיונים — חוזרים לתלות כביסה, לשבת עם קפה, לאכול בחוץ.",
    "פאנלים סולאריים נקיים — שומרים על היעילות והערך של ההשקעה.",
    "ללא קוצים אכזריים, ללא רעל — פתרון הומאני וחוקי.",
    "גג רעפים שמור — לא צריך עוד תיקונים.",
    "פתרון אחד שמכסה את כל החזית של הבית.",
    "התקנה של 5 דקות, מקלות ראש לנצח.",
  ],
  voiceAndTone: `חם, אכפתי ומקצועי. מדבר אל בעל הבית שמתוסכל מהיונים — שייצור צואה כל יום על המרפסת, נזק לפאנלים, ריח, ועצבים.
לא מבטיח השמדה (יונים מוגנות ע"י החוק) — מבטיח הרחקה הומאנית. עובדות יבשות (60 מ"ר, 24/7, ללא כימיקלים) במקום סופרלטיבים.
אמפתי: יודע שהבעלים הצליחו לנסות הכל (קוצים, רשתות, דחלילים) ושום דבר לא עבד.`,
  pestTypes: [
    "יונים",
    "ציפורים פולשות",
    "עופות עירוניים",
    "תוכים פולשים",
  ],
  visualIdentity: {
    primaryColor: "#F59E0B",
    accentColor: "#1E40AF",
    fonts: "Discovery / Heebo / Assistant for Hebrew",
  },
  legalDisclaimers: [
    "התוצאות משתנות לפי גודל אוכלוסיית היונים באזור, מיקום המכשיר, וסוג המבנה. התוצאות אינן מובטחות.",
    "המוצר מיועד להרחקה הומאנית של יונים וציפורים פולשות, ואינו תחליף לטיפול של חברת הדברה מקצועית בנגיעות חמורה.",
    "המוצר אינו פוגע בציפורים — רק מרחיק אותן. בטוח לבני אדם, לכלבים ולחתולים בטווח השימוש המוצע.",
  ],
  brandBookContent: "",
  brandBookContentUS: "",
  customNotes: "",
};
