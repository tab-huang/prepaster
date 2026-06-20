// Lightweight UI-label localization for the key app screens (English / French).
//
// Scope: the AI-generated *plan* is translated server-side (the backend is told to
// respond in French — see ai.synthesize / ai.follow_up). This table covers the
// surrounding *chrome* labels on the plan flow so the screen reads coherently in
// French. The marketing landing page and some minor static copy stay English.
//
// Why French: ProtectionIV's coverage is the US + Canada, and Canada is officially
// bilingual — a francophone user (e.g. in Québec) shouldn't get English-only
// life-safety instructions. (See the exclusion guardrail in DESIGN_PHILOSOPHY.md.)

const STRINGS = {
  en: {
    langLabel: "EN",
    back: "Back",
    emergency: "Emergency:",
    noAlert: "No active alert for a supported hazard at your location.",
    locationErrorLive: "Couldn't get your location. Allow location access, or use Demo Mode.",
    runNextHead: "While you move: your next steps",
    runNextSub: "Assumes you're already doing the above",
    sharePlan: "Share plan",
    planCopied: "Plan copied to clipboard",
    officialOrder: "Official order:",
    officialOrderFallback: "Authorities have issued an evacuation order. Follow it now.",

    // Slideshow
    hideChecklist: "▲ Hide checklist",
    showChecklist: "▼ Show full checklist",
    updatingShort: "Updating…",
    planUpdatedBadge: "Plan updated",
    buildingPlan: "Building your step-by-step plan…",
    yourSituation: "Your situation",
    whatToDo: "What you should do",
    aiGenerated: "AI-generated · OpenRouter",
    stepXofY: "Step {idx} of {total}",
    added: " · added",
    done: "Done",
    markDone: "Mark done",
    start: "Start",
    nextStep: "Next step",
    planEnd: "You're through the plan. Stay safe.",
    needMore: "Need more guidance?",
    startRecovery: "Start recovery plan",
    startRecoveryHint: "Disaster passed? Move to clean-up & paperwork →",
    cancel: "Cancel",
    addingStep: "Adding step…",
    addStep: "Add step",
    addStepPlaceholder: 'e.g. "What should I pack?" or "How do I turn off the gas?"',

    // QuestionsBox
    haveQuestion: "Have a question about your situation?",
    askAnything: "Ask anything",
    thinking: "Thinking…",
    gettingAnswer: "Getting answer…",
    ask: "Ask",
    qaError: "Sorry, couldn't get an answer. Please try again.",
    questionPlaceholder: 'e.g. "Is it safe to use the elevator?" or "What if I smell gas?"',
    pwChip: "Explain an insurance / FEMA letter",
    pwUploaded: "I shared a recovery document to analyze",
    pwPasteHint: "Paste a redacted excerpt — no SSNs, full policy/claim numbers, bank data, or exact addresses.",
    pwPastePh: "Paste the insurance letter, FEMA notice, or claim denial here…",
    pwInsurerPh: "Insurer / issuing org (optional)",
    pwAnalyze: "Analyze this document",
    pwAnalyzing: "Reading the document…",
    pwPrivacy: "Remove sensitive data first",
    pwBoxTitle: "Add an insurance or aid letter (optional)",
    pwBoxSub: "Insurance letter, US FEMA decision, or Canadian provincial disaster-assistance letter? Paste it and I'll pull out the deadlines, required proof, and who to contact.",
    pwBoxPastePh: "Paste your insurance letter, FEMA decision, or provincial disaster-assistance letter here…",
    pwBoxAgain: "Add another letter",
    redactedPrefix: "Sensitive data automatically removed before analyzing:",

    // ConcernsBox
    somethingChanged: "Need to modify plan? Something changed, or you'd rather do something different?",
    updatingPlan: "Updating plan…",
    updateMyPlan: "Update my plan",
    concernPlaceholder: 'e.g. "Roads near me are flooded" or "I can\'t leave, I have pets" or "There\'s a shelter 2 km north"',

    // ResourceCheck
    // Voice
    readAloud: "Read this step aloud",
    readSummaryAloud: "Read this aloud",
    voiceIdle: "Speak your question",
    voiceActive: "Listening… tap to stop",

    quickCheck: "Quick check",
    qVehicle: "Can you reach a vehicle that travels over 30 km/h (19 mph)?",
    aHaveVehicle: "Yes, I have a vehicle",
    aOnFoot: "No, on foot or bicycle",
    qAtHome: "Are you at home right now?",
    aAtHome: "Yes, at home",
    aElsewhere: "No, somewhere else",
    qSlowMovers: "Anyone with you who can't move quickly?",
    aNo: "No",
    aSlowMovers: "Yes, kids, elderly, or mobility needs",
    qNeeds: "Anything we should plan around? (tap any)",
    aMobilityLimited: "Limited mobility",
    aMedicalNeeds: "Medical / powered equipment",
    qSupplies: "Do you already have water and supplies?",
    aYes: "Yes",
    showMe: "Show me what to do",
  },
  fr: {
    langLabel: "FR",
    back: "Retour",
    emergency: "Urgence :",
    noAlert: "Aucune alerte active pour un danger pris en charge à votre position.",
    locationErrorLive: "Impossible d'obtenir votre position. Autorisez l'accès à la localisation, ou utilisez le mode démo.",
    runNextHead: "Pendant que vous bougez : vos prochaines étapes",
    runNextSub: "En supposant que vous faites déjà ce qui précède",
    sharePlan: "Partager le plan",
    planCopied: "Plan copié dans le presse-papiers",
    officialOrder: "Ordre officiel :",
    officialOrderFallback: "Les autorités ont émis un ordre d'évacuation. Suivez-le immédiatement.",

    hideChecklist: "▲ Masquer la liste",
    showChecklist: "▼ Afficher la liste complète",
    updatingShort: "Mise à jour…",
    planUpdatedBadge: "Plan mis à jour",
    buildingPlan: "Création de votre plan étape par étape…",
    yourSituation: "Votre situation",
    whatToDo: "Ce que vous devriez faire",
    aiGenerated: "Généré par IA · OpenRouter",
    stepXofY: "Étape {idx} sur {total}",
    added: " · ajoutée",
    done: "Terminé",
    markDone: "Marquer terminé",
    start: "Commencer",
    nextStep: "Étape suivante",
    planEnd: "Vous avez terminé le plan. Restez en sécurité.",
    needMore: "Besoin de plus de conseils ?",
    startRecovery: "Passer au rétablissement",
    startRecoveryHint: "Danger passé ? Passez au nettoyage et aux démarches →",
    cancel: "Annuler",
    addingStep: "Ajout de l'étape…",
    addStep: "Ajouter une étape",
    addStepPlaceholder: 'ex. : « Que dois-je emporter ? » ou « Comment couper le gaz ? »',

    haveQuestion: "Une question sur votre situation ?",
    askAnything: "Demandez n'importe quoi",
    thinking: "Réflexion…",
    gettingAnswer: "Recherche de la réponse…",
    ask: "Demander",
    qaError: "Désolé, impossible d'obtenir une réponse. Veuillez réessayer.",
    questionPlaceholder: 'ex. : « Puis-je utiliser l\'ascenseur ? » ou « Et si je sens du gaz ? »',
    pwChip: "Décoder une lettre d'assurance / FEMA",
    pwUploaded: "J'ai partagé un document de récupération à analyser",
    pwPasteHint: "Collez un extrait caviardé — pas de NAS, numéros complets de police/réclamation, données bancaires ni adresses exactes.",
    pwPastePh: "Collez ici la lettre d'assurance, l'avis de la FEMA ou le refus de réclamation…",
    pwInsurerPh: "Assureur / organisme émetteur (facultatif)",
    pwAnalyze: "Analyser ce document",
    pwAnalyzing: "Lecture du document…",
    pwPrivacy: "Retirez d'abord les données sensibles",
    pwBoxTitle: "Ajouter une lettre d'assurance ou d'aide (facultatif)",
    pwBoxSub: "Lettre d'assurance, décision de la FEMA (É.-U.) ou lettre d'aide provinciale en cas de catastrophe (Canada) ? Collez-la et j'en extrairai les délais, les preuves requises et qui contacter.",
    pwBoxPastePh: "Collez ici votre lettre d'assurance, décision de la FEMA ou lettre d'aide provinciale…",
    pwBoxAgain: "Ajouter une autre lettre",
    redactedPrefix: "Données sensibles retirées automatiquement avant l'analyse :",

    somethingChanged: "Besoin de modifier le plan ? Quelque chose a changé, ou vous préférez faire autrement ?",
    updatingPlan: "Mise à jour du plan…",
    updateMyPlan: "Mettre à jour mon plan",
    concernPlaceholder: 'ex. : « Les routes près de chez moi sont inondées » ou « Je ne peux pas partir, j\'ai des animaux » ou « Il y a un refuge à 2 km au nord »',

    readAloud: "Lire cette étape à voix haute",
    readSummaryAloud: "Lire à voix haute",
    voiceIdle: "Dictez votre question",
    voiceActive: "Écoute… touchez pour arrêter",

    quickCheck: "Vérification rapide",
    qVehicle: "Pouvez-vous accéder à un véhicule roulant à plus de 30 km/h ?",
    aHaveVehicle: "Oui, j'ai un véhicule",
    aOnFoot: "Non, à pied ou à vélo",
    qAtHome: "Êtes-vous chez vous en ce moment ?",
    aAtHome: "Oui, à la maison",
    aElsewhere: "Non, ailleurs",
    qSlowMovers: "Quelqu'un avec vous qui ne peut pas se déplacer rapidement ?",
    aNo: "Non",
    aSlowMovers: "Oui : enfants, personnes âgées ou à mobilité réduite",
    qNeeds: "Quelque chose à prévoir ? (touchez ce qui s'applique)",
    aMobilityLimited: "Mobilité réduite",
    aMedicalNeeds: "Équipement médical / électrique",
    qSupplies: "Avez-vous déjà de l'eau et des provisions ?",
    aYes: "Oui",
    showMe: "Montrez-moi quoi faire",
  },
};

// makeT("fr") → t("stepXofY", {idx:2, total:5}) → "Étape 2 sur 5".
// Falls back to English, then to the key itself, so a missing string is never fatal.
export function makeT(lang) {
  const table = STRINGS[lang] || STRINGS.en;
  return (key, vars) => {
    let s = table[key] ?? STRINGS.en[key] ?? key;
    if (vars) for (const k of Object.keys(vars)) s = s.replaceAll(`{${k}}`, vars[k]);
    return s;
  };
}
