const BIOS = {
  en: {
    HORMOZI: {
      philosophy: "If the math doesn't work, nothing works.",
      bestAt: ['Pricing your offer & calculating ROI', 'Structuring deals that actually close', 'Turning chaos into a clean business model'],
      silent: ['You need mindset work or emotional support', 'You want content strategy or brand building', 'You need patience — he wants speed'],
      signatures: ["The math doesn't lie.", 'Stack the value.', "What's the LTV?"],
      scenarios: ['Structuring a new offer from scratch', 'Setting prices or analyzing a deal', 'Deciding if a business model is viable'],
    },
    CARDONE: {
      philosophy: 'Average is a failing formula. 10X everything.',
      bestAt: ['Prospecting volume & pipeline urgency', 'Closing tactics & follow-up relentlessness', 'Eliminating excuses around action'],
      silent: ['You need systems or long-term strategy', 'You need psychological deep work', 'You want subtlety — he only has volume'],
      signatures: ['10X everything.', "You're not calling enough.", 'Commit or quit.'],
      scenarios: ['You need to take more action right now', 'Building pipeline and closing faster', 'Getting out of your own head about outreach'],
    },
    ROBBINS: {
      philosophy: 'The pattern is the problem, not the circumstance.',
      bestAt: ['Breaking limiting beliefs blocking progress', 'Shifting emotional state on demand', 'Finding the why that drives everything'],
      silent: ['You need business math or deal structuring', 'You want tactical sales scripts', 'You need systems design'],
      signatures: ["What story are you telling yourself?", 'State drives behavior.', 'Your life is a reflection of your standards.'],
      scenarios: ['You know what to do but can\'t make yourself do it', 'You\'re stuck in fear, doubt, or procrastination', 'You need to shift your energy before a big moment'],
    },
    GARYV: {
      philosophy: "Document, don't create. Legacy over currency.",
      bestAt: ['Content strategy & brand positioning', 'Long-term patience and compound thinking', 'Self-awareness as a competitive advantage'],
      silent: ['You need pricing or deal structuring', 'You want fast tactical wins', 'You need deep psychological work'],
      signatures: ["Document, don't create.", 'Self-awareness is everything.', 'Play long-term games with long-term people.'],
      scenarios: ['Building your personal brand or audience', 'Creating a consistent content strategy', 'Playing the long game when everyone else is rushing'],
    },
    NAVAL: {
      philosophy: 'Build assets that work while you sleep.',
      bestAt: ['Identifying leverage in your business', 'Designing scalable, time-independent systems', 'Long-term wealth through specific knowledge'],
      silent: ['You need short-term sales volume', 'You want emotional support or motivation', 'You need tactical scripts or closing lines'],
      signatures: ["Does this scale without you?", 'Specific knowledge.', 'Leverage.'],
      scenarios: ['Designing your business model for scale', 'Building systems that remove you as the bottleneck', 'Thinking about long-term wealth, not just revenue'],
    },
    VOSS: {
      philosophy: 'The person most comfortable with silence wins.',
      bestAt: ['Negotiation tactics & mirroring techniques', 'Handling objections with tactical empathy', 'Turning difficult conversations into leverage'],
      silent: ['You need business model or content strategy', 'You need motivational energy', 'You want pricing frameworks'],
      signatures: ["That's right.", "It seems like...", "How am I supposed to do that?"],
      scenarios: ['Before a sales call or pricing conversation', 'Navigating a partnership negotiation', 'When someone says no and you need a path forward'],
    },
  },

  fr: {
    HORMOZI: {
      philosophy: "Si les chiffres ne marchent pas, rien ne marche.",
      bestAt: ["Structurer ton offre et calculer le ROI", "Monter des deals qui se closent vraiment", "Transformer le chaos en modèle d'affaires clair"],
      silent: ["Tu as besoin de mindset ou soutien émotionnel", "Tu veux une stratégie de contenu ou de marque", "Tu as besoin de patience — lui veut de la vitesse"],
      signatures: ["Les chiffres ne mentent pas.", "Empile la valeur.", "C'est quoi le LTV?"],
      scenarios: ["Structurer une nouvelle offre de zéro", "Fixer tes prix ou analyser un deal", "Décider si un modèle d'affaires est viable"],
    },
    CARDONE: {
      philosophy: "La moyenne est une formule perdante. 10X tout.",
      bestAt: ["Volume de prospection et urgence pipeline", "Tactiques de closing et relances sans pitié", "Éliminer les excuses autour du passage à l'action"],
      silent: ["Tu as besoin de systèmes ou stratégie long terme", "Tu as besoin de travail psychologique profond", "Tu veux de la subtilité — il n'a que du volume"],
      signatures: ["10X tout.", "Tu n'appelles pas assez.", "Engage ou abandonne."],
      scenarios: ["Tu dois passer à l'action maintenant", "Construire ton pipeline et closer plus vite", "Sortir de ta tête sur la prospection"],
    },
    ROBBINS: {
      philosophy: "Le schéma est le problème, pas les circonstances.",
      bestAt: ["Briser les croyances limitantes qui bloquent", "Changer ton état émotionnel sur demande", "Trouver le pourquoi qui drive tout le reste"],
      silent: ["Tu as besoin de chiffres ou structuration de deals", "Tu veux des scripts de vente tactiques", "Tu as besoin de design de systèmes"],
      signatures: ["Quelle histoire tu te racontes?", "L'état dicte le comportement.", "Ta vie reflète tes standards."],
      scenarios: ["Tu sais quoi faire mais tu n'arrives pas à agir", "Tu es bloqué dans la peur, le doute ou la procrastination", "Tu dois changer d'énergie avant un moment important"],
    },
    GARYV: {
      philosophy: "Documente, ne crée pas. L'héritage avant l'argent.",
      bestAt: ["Stratégie de contenu et positionnement de marque", "Patience long terme et pensée composée", "La conscience de soi comme avantage compétitif"],
      silent: ["Tu as besoin de pricing ou structuration de deals", "Tu veux des gains tactiques rapides", "Tu as besoin de travail psychologique profond"],
      signatures: ["Documente, ne crée pas.", "La conscience de soi, c'est tout.", "Joue des jeux long terme avec des gens long terme."],
      scenarios: ["Construire ta marque personnelle ou ton audience", "Créer une stratégie de contenu cohérente", "Jouer long terme quand tout le monde se précipite"],
    },
    NAVAL: {
      philosophy: "Construis des actifs qui travaillent pendant que tu dors.",
      bestAt: ["Identifier le levier dans ton business", "Concevoir des systèmes scalables sans toi", "Richesse long terme via connaissance spécifique"],
      silent: ["Tu as besoin de volume de ventes court terme", "Tu veux du soutien émotionnel ou de la motivation", "Tu as besoin de scripts tactiques ou de lignes de closing"],
      signatures: ["Est-ce que ça scale sans toi?", "Connaissance spécifique.", "Levier."],
      scenarios: ["Concevoir ton modèle d'affaires pour scaler", "Construire des systèmes qui t'enlèvent du goulot", "Penser à la richesse long terme, pas juste aux revenus"],
    },
    VOSS: {
      philosophy: "Celui qui est le plus à l'aise avec le silence gagne.",
      bestAt: ["Tactiques de négociation et techniques de mirroring", "Gérer les objections avec empathie tactique", "Transformer les conversations difficiles en levier"],
      silent: ["Tu as besoin de modèle d'affaires ou stratégie contenu", "Tu as besoin d'énergie motivationnelle", "Tu veux des frameworks de pricing"],
      signatures: ["C'est exact.", "Il semble que...", "Comment je suis censé faire ça?"],
      scenarios: ["Avant un appel de vente ou une conversation sur les prix", "Naviguer une négociation de partenariat", "Quand quelqu'un dit non et tu cherches une sortie"],
    },
  },
};

export function getAgentBio(agentKey, lang = 'fr') {
  return BIOS[lang]?.[agentKey] ?? BIOS.en[agentKey] ?? null;
}
