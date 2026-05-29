"use client";

import { Language } from "@/lib/types";

const languages: { value: Language; label: string; flag: string }[] = [
  { value: "he", label: "עברית", flag: "🇮🇱" },
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "ar", label: "العربية", flag: "🇸🇦" },
  { value: "de", label: "Deutsch", flag: "🇩🇪" },
  { value: "ru", label: "Русский", flag: "🇷🇺" },
  { value: "fr", label: "Français", flag: "🇫🇷" },
];

interface LanguageSelectorProps {
  value: Language;
  onChange: (lang: Language) => void;
}

export default function LanguageSelector({
  value,
  onChange,
}: LanguageSelectorProps) {
  return (
    <div className="flex gap-2">
      {languages.map((lang) => (
        <button
          key={lang.value}
          onClick={() => onChange(lang.value)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
            value === lang.value
              ? "bg-primary text-white shadow-sm"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-border"
          }`}
        >
          <span>{lang.flag}</span>
          <span>{lang.label}</span>
        </button>
      ))}
    </div>
  );
}
