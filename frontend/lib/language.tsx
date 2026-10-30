"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Lang = "en" | "hi" | "kn";

const DICTS: Record<Lang, Record<string, string>> = {
  en: {
    dashboard: "Dashboard",
    documents: "Documents",
    upload: "Upload",
    records: "Records",
    audit_trail: "Audit Trail",
    sign_out: "Sign out",
    search_placeholder: "Search student, APAAR ID, institution…",
    live_pipeline: "Live Pipeline",
    upload_documents: "Upload Documents",
    verification_queue: "Verification Queue",
    high_medium_risk: "High/Medium Risk",
    all_pending: "All Pending",
    your_uploads: "Your Uploads",
    review_edit: "Review & Edit",
    approve: "Approve",
    reject: "Reject",
    mark_unresolved: "Mark Unresolved",
    human_verification: "Human Verification",

    land_records: "Student Records",
    records_search_hint: "Search by student name, APAAR ID, student ID, institution or program.",
    search_records: "Search records…",
    no_matching_records: "No matching records",
    try_different_search: "Try a different student name, APAAR ID or institution.",
    no_records_yet: "No records yet",
    upload_to_create_hint: "Upload student data to create your first student record.",
    owner: "Student",
    survey_khasra: "APAAR ID",
    location: "Institution / Program",
    status: "Status",
    confidence: "Confidence",
    record: "Record",
    anomaly: "Anomaly",
    created: "Created",
    view: "View",

    documents_hint: "Uploaded scans, images and PDFs awaiting or completing digitization.",
    upload_document: "Upload Document",
    no_documents_yet: "No documents yet",
    upload_hint: "Upload a scanned admission list or form to see the OCR pipeline in action.",
    document: "Document",
    size: "Size",
    uploaded: "Uploaded",
  },
  hi: {
    dashboard: "डैशबोर्ड",
    documents: "दस्तावेज़",
    upload: "अपलोड",
    records: "अभिलेख",
    audit_trail: "ऑडिट ट्रेल",
    sign_out: "साइन आउट",
    search_placeholder: "स्वामी, सर्वे, खसरा, गांव खोजें…",
    live_pipeline: "लाइव पाइपलाइन",
    upload_documents: "दस्तावेज़ अपलोड करें",
    verification_queue: "सत्यापन कतार",
    high_medium_risk: "उच्च/मध्यम जोखिम",
    all_pending: "सभी लंबित",
    your_uploads: "आपके अपलोड",
    review_edit: "समीक्षा करें और संपादित करें",
    approve: "स्वीकृत करें",
    reject: "अस्वीकार करें",
    mark_unresolved: "अनसुलझा चिह्नित करें",
    human_verification: "मानव सत्यापन",

    land_records: "छात्र अभिलेख",
    records_search_hint: "छात्र का नाम, आपार आईडी, संस्थान या पाठ्यक्रम से खोजें।",
    search_records: "अभिलेख खोजें…",
    no_matching_records: "कोई मेल खाता अभिलेख नहीं",
    try_different_search: "अलग स्वामी नाम, सर्वे नंबर या गांव आज़माएं।",
    no_records_yet: "अभी कोई अभिलेख नहीं",
    upload_to_create_hint: "अपना पहला छात्र अभिलेख बनाने के लिए छात्र डेटा अपलोड करें।",
    owner: "छात्र",
    survey_khasra: "आपार आईडी",
    location: "स्थान",
    status: "स्थिति",
    confidence: "विश्वसनीयता",
    record: "अभिलेख",
    anomaly: "विसंगति",
    created: "बनाया गया",
    view: "देखें",

    documents_hint: "अपलोड किए गए स्कैन, छवियां और पीडीएफ जो डिजिटलीकरण की प्रतीक्षा में हैं या पूर्ण हो चुके हैं।",
    upload_document: "दस्तावेज़ अपलोड करें",
    no_documents_yet: "अभी कोई दस्तावेज़ नहीं",
    upload_hint: "पाइपलाइन को क्रियान्वित होते देखने के लिए एक स्कैन किया गया भूमि अभिलेख अपलोड करें।",
    document: "दस्तावेज़",
    size: "आकार",
    uploaded: "अपलोड किया गया",
  },
  kn: {
    dashboard: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
    documents: "ದಾಖಲೆಗಳು",
    upload: "ಅಪ್‌ಲೋಡ್",
    records: "ದಾಖಲೆಗಳು",
    audit_trail: "ಆಡಿಟ್ ಟ್ರೇಲ್",
    sign_out: "ಸೈನ್ ಔಟ್",
    search_placeholder: "ಮಾಲೀಕರು, ಸರ್ವೆ, ಗ್ರಾಮ ಹುಡುಕಿ…",
    live_pipeline: "ಲೈವ್ ಪೈಪ್‌ಲೈನ್",
    upload_documents: "ದಾಖಲೆಗಳನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
    verification_queue: "ಪರಿಶೀಲನಾ ಸರತಿ",
    high_medium_risk: "ಹೆಚ್ಚು/ಮಧ್ಯಮ ಅಪಾಯ",
    all_pending: "ಎಲ್ಲಾ ಬಾಕಿ",
    your_uploads: "ನಿಮ್ಮ ಅಪ್‌ಲೋಡ್‌ಗಳು",
    review_edit: "ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಸಂಪಾದಿಸಿ",
    approve: "ಅನುಮೋದಿಸಿ",
    reject: "ತಿರಸ್ಕರಿಸಿ",
    mark_unresolved: "ಬಗೆಹರಿಯದಿರುವಂತೆ ಗುರುತಿಸಿ",
    human_verification: "ಮಾನವ ಪರಿಶೀಲನೆ",

    land_records: "ವಿದ್ಯಾರ್ಥಿ ದಾಖಲೆಗಳು",
    records_search_hint: "ವಿದ್ಯಾರ್ಥಿ ಹೆಸರು, ಆಪಾರ್ ಐಡಿ, ಸಂಸ್ಥೆ ಅಥವಾ ಕೋರ್ಸ್ ಮೂಲಕ ಹುಡುಕಿ.",
    search_records: "ದಾಖಲೆಗಳನ್ನು ಹುಡುಕಿ…",
    no_matching_records: "ಯಾವುದೇ ಹೊಂದಾಣಿಕೆಯ ದಾಖಲೆಗಳಿಲ್ಲ",
    try_different_search: "ಬೇರೆ ಮಾಲೀಕರ ಹೆಸರು, ಸರ್ವೆ ಸಂಖ್ಯೆ ಅಥವಾ ಗ್ರಾಮವನ್ನು ಪ್ರಯತ್ನಿಸಿ.",
    no_records_yet: "ಇನ್ನೂ ಯಾವುದೇ ದಾಖಲೆಗಳಿಲ್ಲ",
    upload_to_create_hint: "ನಿಮ್ಮ ಮೊದಲ ಭೂ ದಾಖಲೆಯನ್ನು ರಚಿಸಲು ದಾಖಲೆಯನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
    owner: "ವಿದ್ಯಾರ್ಥಿ",
    survey_khasra: "ಆಪಾರ್ ಐಡಿ",
    location: "ಸ್ಥಳ",
    status: "ಸ್ಥಿತಿ",
    confidence: "ವಿಶ್ವಾಸಾರ್ಹತೆ",
    record: "ದಾಖಲೆ",
    anomaly: "ವೈಪರೀತ್ಯ",
    created: "ರಚಿಸಲಾಗಿದೆ",
    view: "ವೀಕ್ಷಿಸಿ",

    documents_hint: "ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ಸ್ಕ್ಯಾನ್‌ಗಳು, ಚಿತ್ರಗಳು ಮತ್ತು ಪಿಡಿಎಫ್‌ಗಳು ಡಿಜಿಟಲೀಕರಣಕ್ಕಾಗಿ ಕಾಯುತ್ತಿವೆ ಅಥವಾ ಪೂರ್ಣಗೊಂಡಿವೆ.",
    upload_document: "ದಾಖಲೆಯನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ",
    no_documents_yet: "ಇನ್ನೂ ಯಾವುದೇ ದಾಖಲೆಗಳಿಲ್ಲ",
    upload_hint: "ಪೈಪ್‌ಲೈನ್ ಕ್ರಿಯೆಯಲ್ಲಿರುವುದನ್ನು ನೋಡಲು ಸ್ಕ್ಯಾನ್ ಮಾಡಿದ ಭೂ ದಾಖಲೆಯನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.",
    document: "ದಾಖಲೆ",
    size: "ಗಾತ್ರ",
    uploaded: "ಅಪ್‌ಲೋಡ್ ಮಾಡಲಾಗಿದೆ",
  },
};

export const LANG_LABELS: Record<Lang, string> = { en: "English", hi: "हिन्दी", kn: "ಕನ್ನಡ" };

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? (window.localStorage.getItem("logicred_lang") as Lang | null) : null;
    if (stored && DICTS[stored]) setLangState(stored);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    if (typeof window !== "undefined") window.localStorage.setItem("logicred_lang", l);
  }

  function t(key: string): string {
    return DICTS[lang][key] || DICTS.en[key] || key;
  }

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
