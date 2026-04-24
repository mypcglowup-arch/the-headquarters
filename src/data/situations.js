/**
 * Bibliothèque de situations — 50 scénarios pré-construits pour les moments
 * critiques du quotidien solo-consultant.
 *
 * Format : frameworks structurés (pas mot-à-mot) — "reconnaître → pivoter →
 * tenir". Chaque situation = agent assigné + script base + 0-2 variants selon
 * contexte. Voix de l'agent respectée dans le ton.
 *
 * Catégories :
 *   negotiation, objection, closing, prospecting, content, mindset,
 *   pricing, difficult-client, referral, leverage
 *
 * Répartition agents :
 *   VOSS 10 · CARDONE 10 · HORMOZI 8 · GARYV 8 · ROBBINS 7 · NAVAL 7 = 50
 *
 * EN translations : TODO (phase ultérieure). Pour l'instant { fr } only.
 */

export const SITUATION_CATEGORIES = [
  { id: 'negotiation',      label: { fr: 'Négociation' } },
  { id: 'objection',        label: { fr: 'Objections' } },
  { id: 'closing',          label: { fr: 'Closing' } },
  { id: 'prospecting',      label: { fr: 'Prospection' } },
  { id: 'content',          label: { fr: 'Contenu / Brand' } },
  { id: 'mindset',          label: { fr: 'Mindset' } },
  { id: 'pricing',          label: { fr: 'Pricing' } },
  { id: 'difficult-client', label: { fr: 'Client difficile' } },
  { id: 'referral',         label: { fr: 'Référencement' } },
  { id: 'leverage',         label: { fr: 'Levier / Systèmes' } },
];

export const SITUATIONS = [
  // ═══════════════════════════════════════════════════════════════════════
  // VOSS — 10 scénarios (negotiation / objection / difficult-client)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'negotiate-price-down',
    agent: 'VOSS',
    category: 'negotiation',
    title: { fr: 'Négocier un prix à la baisse' },
    context: { fr: 'Le prospect veut un rabais mais ne donne pas de raison solide.' },
    script: { fr: `Structure : labeliser la demande → retourner la question → tenir la ligne.

1. **Labeliser** (nommer ce qu'il ressent sans juger)
   → "On dirait que le budget est serré."
   → "Tu veux être sûr que ça vaut le coup."

2. **Retourner** (accusation audit inversé)
   → "Qu'est-ce qui te ferait dire oui à ce prix-ci ?"
   → Sa réponse révèle sa vraie objection (valeur, timing, confiance).

3. **Tenir** (sans justifier, sans se défendre)
   → "Mon plancher reste à X. Je peux ajuster le livrable, pas le tarif."

La clé : jamais descendre sans enlever de valeur en échange. Un rabais sans contrepartie signale que tu aurais pu demander plus depuis le début.` },
    variants: [
      { label: { fr: 'Si c\'est un premier contact' }, script: { fr: `Contexte nouveau = pas encore de confiance, pas encore de preuve.

1. **Reconnaître l'effort du doute** : "C'est normal de vouloir tester avant d'engager."
2. **Pivoter vers un audit** : "Je peux te faire un diagnostic à tarif réduit. Si ça livre, on passe au vrai mandat au prix plein."
3. **Ancrer le vrai tarif** : le prix que tu défends au mandat complet est non-négociable après l'audit.

Le prospect achète la réduction de risque, pas le rabais.` } },
      { label: { fr: 'Si c\'est un ami/famille' }, script: { fr: `Le piège : dire oui par relation, résenter après.

1. **Distinguer explicitement** : "Comme ami, je te conseille gratuit. Comme client, mon tarif c'est X."
2. **Donner le choix clair** : conseil gratuit (brève conversation) OU mandat payant (livrable complet).
3. **Si insiste pour rabais sur le mandat** : "Je ne fais pas de rabais amis — ça crée des attentes floues. Soit c'est à plein tarif, soit c'est un conseil gratuit off-the-record."` } },
    ],
    keywords: ['prix', 'rabais', 'discount', 'négociation', 'budget'],
  },
  {
    id: 'objection-too-expensive',
    agent: 'VOSS',
    category: 'objection',
    title: { fr: 'Objection "C\'est trop cher"' },
    context: { fr: '"Trop cher" est presque jamais un problème de prix. C\'est un problème de valeur perçue ou de confiance.' },
    script: { fr: `Structure : calibrer la question → faire parler le coût de l'inaction → ne pas justifier.

1. **Calibrer** (question ouverte qui force la réflexion)
   → "Trop cher par rapport à quoi ?"
   → Sa réponse = un benchmark que tu peux adresser, ou du flou = pas de vraie objection.

2. **Coût de l'inaction**
   → "Combien ça te coûte chaque mois de ne pas résoudre ce problème ?"
   → Si son "trop cher" = 3000$ mais son problème lui coûte 8000$/mois, l'équation bascule.

3. **Silence stratégique**
   → Après avoir énoncé ton prix, **ne parle pas**. Le premier qui brise le silence perd du terrain.

Règle : ne jamais défendre le prix. Défendre = signal que le prix est discutable.` },
    variants: [
      { label: { fr: 'S\'il compare avec un concurrent' }, script: { fr: `1. **Valider sans minimiser** : "C'est intelligent de comparer."
2. **Reframer le scope** : "Est-ce qu'ils livrent [X spécifique que tu livres] ?" — force-le à examiner la comparaison en détail.
3. **Prix ≠ coût total** : "Leur tarif est plus bas. Ajoute les revisions, les délais, les rebonds — on se reparle ?"

Si vraiment ton prix est plus haut sans raison défendable, c'est un problème de positionnement, pas de négociation.` } },
    ],
    keywords: ['trop cher', 'prix', 'budget', 'objection', 'valeur'],
  },
  {
    id: 'objection-think-about-it',
    agent: 'VOSS',
    category: 'objection',
    title: { fr: 'Objection "On va y penser"' },
    context: { fr: '"On va y penser" = un non poli 80% du temps. Ton job : transformer ça en un vrai oui ou un vrai non.' },
    script: { fr: `Structure : inviter le non → mirror la résistance → fixer un timeline.

1. **Inviter le non** (désactive la pression)
   → "Est-ce que ce serait une mauvaise idée de décider aujourd'hui ?"
   → Un "non" à cette question = il est prêt à avancer.
   → Un "oui, ce serait une mauvaise idée" = tu extrais la vraie raison derrière.

2. **Mirror** (répéter les 3 derniers mots)
   → Lui : "Je veux en parler à mon associé."
   → Toi : "À ton associé ?"
   → Il développe. Tu apprends.

3. **Fixer un point de reprise**
   → "OK. Qu'est-ce qui déciderait de la réponse, et quand ?"
   → Sans deadline, "y penser" = mort lente.` },
    variants: [],
    keywords: ['y penser', 'réfléchir', 'attendre', 'décision', 'stall'],
  },
  {
    id: 'objection-already-have-provider',
    agent: 'VOSS',
    category: 'objection',
    title: { fr: 'Objection "On a déjà un fournisseur"' },
    context: { fr: 'Tu tombes sur un prospect qui a déjà quelqu\'un. La question n\'est pas "peux-tu le remplacer" mais "qu\'est-ce qui lui manque".' },
    script: { fr: `Structure : ne pas attaquer le concurrent → sonder le manque → te positionner en complément ou en back-up.

1. **Valider la relation existante**
   → "Bien. C'est important d'avoir quelqu'un de fiable."
   → Surtout ne critique jamais le fournisseur actuel — ça attaque son jugement.

2. **Sonder le manque**
   → "Qu'est-ce qui te frustre encore malgré ce qu'il fait pour toi ?"
   → Il y a TOUJOURS un manque. C'est là que tu rentres.

3. **Pozer une option de back-up**
   → "Quand il sera débordé ou que tu auras un besoin spécifique qu'il ne couvre pas, appelle-moi. Je garde ton dossier prêt."

Tu plantes une graine. 30% des fournisseurs se cassent la gueule dans les 12 mois.` },
    variants: [],
    keywords: ['fournisseur', 'concurrent', 'déjà', 'existant', 'relation'],
  },
  {
    id: 'client-ghosting-after-demo',
    agent: 'VOSS',
    category: 'difficult-client',
    title: { fr: 'Client qui ghost après démo' },
    context: { fr: 'Bon appel, devis envoyé, silence depuis 10 jours.' },
    script: { fr: `Structure : email court + un vrai prétexte + un "non" invité.

1. **Objet de l'email** : direct, pas "Suivi XYZ"
   → "Dossier [Client] — je ferme ou on avance ?"

2. **Corps** (3 lignes max)
   → "Pas de nouvelle depuis [date]. Je veux pas te spammer.
   Deux options : (a) tu es toujours intéressé, on reprend · (b) c'est plus une priorité, je ferme le dossier proprement.
   Réponds juste "a" ou "b" et c'est réglé."

3. **Effet** : lui offrir le "non" élimine la culpabilité de ne pas répondre. Tu auras ton taux de réponse à 70%+.

Ne jamais envoyer "juste pour checker in". Respecte son inbox, respecte le tien.` },
    variants: [
      { label: { fr: 'Après un 2ème ghost (dernier message)' }, script: { fr: `Un seul message, direct, ferme :

"Hey [Prénom], je te sors de ma liste active. Si ça redevient pertinent dans le futur, reviens vers moi — je garde tes notes pendant 6 mois.

Pas de rancune, juste la logique de mon pipeline."

Effet : soit il réagit immédiatement (signal fort de vrai intérêt), soit il disparaît vraiment — et tu récupères ton énergie mentale.` } },
    ],
    keywords: ['ghost', 'silence', 'relance', 'suivi', 'no reply'],
  },
  {
    id: 'deadline-without-pressure',
    agent: 'VOSS',
    category: 'negotiation',
    title: { fr: 'Demander un deadline sans paraître pressant' },
    context: { fr: 'Tu dois forcer une décision sans que ça sente la pression commerciale.' },
    script: { fr: `Structure : ancrer un besoin réel → demander, pas imposer.

1. **Contextualiser ta réalité** (pas la sienne)
   → "Je bloque des semaines de prod à l'avance. Pour commencer en [mois], j'ai besoin d'un go/no-go d'ici [date]."

2. **Inviter la négociation du deadline**
   → "Cette date te semble raisonnable ?"
   → S'il dit non → "Qu'est-ce qui te permettrait de décider ?"

3. **Ancrer la conséquence neutre**
   → "Sinon on glisse à [mois suivant]. Pas de problème, juste que je place un autre mandat cette semaine-là."

Clé : pas de "dernière chance", pas d'urgence fabriquée. Juste ta réalité de capacité.` },
    variants: [],
    keywords: ['deadline', 'pression', 'décision', 'urgence', 'délai'],
  },
  {
    id: 'renegotiate-retainer-down',
    agent: 'VOSS',
    category: 'negotiation',
    title: { fr: 'Renégocier un retainer en baisse' },
    context: { fr: 'Client veut baisser le retainer mensuel. Ton job : protéger la marge sans perdre le client.' },
    script: { fr: `Structure : accusation audit → trade-off explicite → refaire la math.

1. **Accusation audit** (désamorce ses craintes)
   → "Tu vas sûrement penser que je veux protéger ma revenue à tout prix, mais je veux qu'on trouve une structure qui marche pour les deux."

2. **Trade-off explicite**
   → "Je peux descendre le retainer, mais il faut ajuster le scope. On coupe quoi ?"
   → Si rien à couper : "Alors le prix ne peut pas descendre sans moi qui travaille gratuitement."

3. **Refaire la math ensemble**
   → "Regarde — à ce nouveau prix, voici les heures possibles. Voici ce qui rentre. Voici ce qui sort. Tu décides."

Protéger la marge > protéger la relation. Un client qui te paye sous ton seuil te blessera six mois plus tard.` },
    variants: [],
    keywords: ['retainer', 'renégocier', 'baisse', 'scope', 'marge'],
  },
  {
    id: 'refuse-scope-creep',
    agent: 'VOSS',
    category: 'difficult-client',
    title: { fr: 'Refuser une demande hors scope gratuitement' },
    context: { fr: 'Client demande "juste un petit truc en plus". C\'est comme ça que la marge disparaît.' },
    script: { fr: `Structure : labeliser le pattern → offrir deux routes → ne jamais dire "non" sec.

1. **Labeliser sans attaquer**
   → "On dirait que le besoin a évolué depuis notre cadrage."

2. **Offrir deux routes claires**
   → "Deux options : (a) on ajoute ça au mandat, je t'envoie un avenant de X — on discute une fois signé · (b) on garde le scope actuel et on capture [nouveau besoin] dans un prochain mandat."

3. **Ne jamais dire "c'est gratuit" pour acheter la paix**
   → Chaque extra gratuit crée le précédent que le suivant le sera aussi. La relation ne résiste pas à ça.

Si le client pousse → "Je te respecte trop pour travailler gratuitement. Et toi tu te respectes trop pour me demander ça."` },
    variants: [],
    keywords: ['scope creep', 'hors scope', 'gratuit', 'extra', 'avenant'],
  },
  {
    id: 'get-honest-no',
    agent: 'VOSS',
    category: 'negotiation',
    title: { fr: 'Obtenir un "non" honnête (plutôt qu\'un faux oui)' },
    context: { fr: 'Tu sens que le prospect dit oui par politesse, pas par conviction. Les faux oui sont plus coûteux que les non.' },
    script: { fr: `Structure : inviter le non → normaliser le refus → désactiver la politesse.

1. **Inviter explicitement le non**
   → "Si c'est pas pour toi, c'est vraiment OK de me le dire maintenant."
   → "Qu'est-ce qui te ferait dire non avec confiance ?"

2. **Normaliser le refus**
   → "La plupart des gens que j'aide savent dans les 5 premières minutes si c'est oui ou non. Où tu en es ?"

3. **Désactiver la politesse canadienne**
   → "T'as pas à être gentil avec moi. Un vrai non m'aide plus qu'un faux oui."

Un prospect qui peut dire non confortablement sera aussi plus honnête quand il dira oui.` },
    variants: [],
    keywords: ['non', 'honnêteté', 'faux oui', 'politesse', 'clarté'],
  },
  {
    id: 'client-changing-mind',
    agent: 'VOSS',
    category: 'difficult-client',
    title: { fr: 'Gérer un client qui change sans arrêt d\'avis' },
    context: { fr: 'Chaque révision ouvre une nouvelle révision. La prod stagne, la marge s\'évapore.' },
    script: { fr: `Structure : mirror le pattern → rendre le coût visible → cadrer la limite.

1. **Mirror le pattern à voix haute**
   → "La direction a changé 3 fois depuis [date]."
   → Pas accusateur. Juste factuel. Laisse le silence.

2. **Rendre le coût visible**
   → "Chaque redirection coûte [X heures / Y $]. À ce rythme, le mandat va dépasser [Z]."
   → Fournis les chiffres. Les chiffres désamorcent l'émotion.

3. **Cadrer la limite**
   → "Je te propose : on gèle les specs aujourd'hui. Chaque changement après coûte [montant fixe]. Ça te force à décider, ça me protège."

Si le client refuse le cadre : c'est qu'il veut un buffet illimité à prix fixe. Sors du mandat.` },
    variants: [],
    keywords: ['indécision', 'révisions', 'scope', 'limite', 'cadrage'],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CARDONE — 10 scénarios (sales / prospecting / closing)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'close-end-of-month',
    agent: 'CARDONE',
    category: 'closing',
    title: { fr: 'Closer en fin de mois' },
    context: { fr: 'Il te manque un deal pour hit ton objectif mensuel. Tu as 48-72h.' },
    script: { fr: `Structure : inventaire → urgence réelle → offre asymétrique.

1. **Inventaire** (liste tous les prospects chauds, triés)
   → Les 5 qui ont dit "intéressant" dans les 14 derniers jours.
   → Classe par proximité au oui.

2. **Urgence réelle, pas fabriquée**
   → "Je bloque mes slots de [mois prochain] cette semaine. Tu veux être dedans ?"
   → Si ton calendrier est vraiment plein, cette phrase est vraie. Si tu mens, il le sentira.

3. **Offre asymétrique** (pour le top 2)
   → "Si tu signes avant [date], je bloque ton slot. Après, je prends qui vient."
   → Aucun rabais. Juste un slot qui disparaît.

Action : contacte les 5 top aujourd'hui. 5 appels. Pas d'email. 5 appels.` },
    variants: [
      { label: { fr: 'Si le mois est déjà perdu' }, script: { fr: `Change de cible : vise le mois prochain, pas celui-ci.

1. **Stop chercher à sauver le mois** — tu vas closer à rabais par désespoir, tu vas blesser ta marge.
2. **Double les appels** cette semaine pour remplir le pipeline du mois suivant. 10 appels/jour.
3. **Re-contacte les "on se reparle le mois prochain"** de l'année passée. Un tiers va répondre.

Jouer pour le mois prochain avec force > sauver celui-ci par faiblesse.` } },
    ],
    keywords: ['closing', 'fin de mois', 'objectif', 'urgence', 'quota'],
  },
  {
    id: 'cold-first-contact',
    agent: 'CARDONE',
    category: 'prospecting',
    title: { fr: 'Cold outreach premier contact' },
    context: { fr: 'Email ou DM à quelqu\'un qui ne te connaît pas. Tu as 3 secondes pour qu\'il lise la 2ème ligne.' },
    script: { fr: `Structure : hook spécifique → valeur en 1 phrase → low-commitment CTA.

1. **Hook spécifique** (preuve que c'est pas un blast)
   → "J'ai vu ton post sur [sujet précis le [date]]" OU "Ton [business] vient d'ouvrir [location]"
   → Si tu peux pas personnaliser avec un détail, n'envoie pas.

2. **Valeur en 1 phrase** (ce que tu fais, pour qui, quel résultat)
   → "J'aide les [niche] à [résultat chiffré] en [méthode]."

3. **Low-commitment CTA**
   → PAS : "Peut-on se parler ?" (trop gros)
   → OUI : "Si ça te parle, je peux te partager en 3 bullets comment ça marcherait pour toi. Open ?"
   → Un "open" coûte 0 à envoyer. Un "on se parle ?" coûte 30 min à accepter.` },
    variants: [
      { label: { fr: 'Sur LinkedIn DM (pas email)' }, script: { fr: `LinkedIn = plus court, plus cash, pas de salutation formelle.

1. **Ligne 1** : le hook (observation sur son profil/post)
2. **Ligne 2** : "Je fais X pour des Y comme toi. Résultat typique : Z."
3. **Ligne 3** : "Intéressé d'en savoir plus ?" OU "Veux la méthode en 2 bullets ?"

Max 3 lignes. Pas de pavé. Pas d'emoji. Pas de "j'espère que tu vas bien".` } },
    ],
    keywords: ['cold', 'outreach', 'email', 'linkedin', 'premier contact'],
  },
  {
    id: 'follow-up-multiple',
    agent: 'CARDONE',
    category: 'prospecting',
    title: { fr: 'Follow-up #3, #5, #7 sans paraître desperate' },
    context: { fr: 'Le follow-up moyen close au 5ème touch. La plupart des vendeurs arrêtent au 2ème.' },
    script: { fr: `Structure : chaque follow-up apporte quelque chose → ne jamais redemander la même chose.

1. **Follow-up #3** (valeur ajoutée)
   → "Je pensais à ton cas — voici un [ressource courte] qui pourrait t'aider."
   → Pas "je reviens vers toi". Une ressource, un insight, un chiffre pertinent.

2. **Follow-up #5** (preuve sociale spécifique)
   → "Je viens de closer [client similaire] sur [problème similaire]. Résultat : [chiffre]. Ça t'inspire ?"

3. **Follow-up #7** (la porte de sortie)
   → "Je te sors de ma liste active. Si ça redevient pertinent, tu sais où me trouver."
   → 40% réactivent à celui-là.

Règle absolue : alterner valeur (3, 5) et pression légère (4, 6). Jamais 7 "just checking in" d'affilée.` },
    variants: [],
    keywords: ['follow-up', 'relance', 'persévérance', 'touch', 'séquence'],
  },
  {
    id: 'elevator-pitch-30sec',
    agent: 'CARDONE',
    category: 'prospecting',
    title: { fr: 'Pitcher en 30 secondes' },
    context: { fr: 'Quelqu\'un te demande "tu fais quoi dans la vie ?" dans un event, un Uber, un lunch.' },
    script: { fr: `Structure : qui j'aide → à quel résultat → preuve courte.

1. **Qui j'aide** (1 phrase, niche serrée)
   → "J'aide les [segment spécifique]."
   → Pas "j'aide les entreprises". Plus c'est niche, plus c'est mémorable.

2. **À quel résultat** (chiffré si possible)
   → "...à [doubler X / économiser Y / générer Z]."

3. **Preuve courte** (1 exemple max)
   → "Dernièrement j'ai aidé [client/type] à [résultat]."

4. **CTA invisible** (laisse la porte ouverte sans forcer)
   → "Tu connais quelqu'un qui galère avec ça ?"

Test : entraîne-toi à le dire en 25 secondes. 30 si tu parles lent. Au-delà, c'est pas un pitch, c'est une présentation.` },
    variants: [],
    keywords: ['elevator pitch', 'pitch', '30 secondes', 'présentation', 'networking'],
  },
  {
    id: 'ask-for-referral',
    agent: 'CARDONE',
    category: 'referral',
    title: { fr: 'Demander un référencement' },
    context: { fr: 'Client content. Tu n\'as jamais demandé de referral. La meilleure source de leads que tu laisses sur la table.' },
    script: { fr: `Structure : contextualiser → rendre spécifique → baisser la friction.

1. **Contextualiser** (après un win)
   → "Content que ça ait livré sur [résultat]. Je peux te demander quelque chose ?"

2. **Rendre spécifique** (pas "tu connais quelqu'un")
   → "Tu connais un autre [type de personne — ex: salon de beauté à Québec, coach business en scale] qui galère avec [problème que tu résous] ?"
   → Une demande vague = zéro réponse. Une demande précise active sa mémoire.

3. **Baisser la friction**
   → "Si oui, je peux te rédiger un message copy-paste pour le présenter. Tu changes juste le nom."

Le moment optimal : 2-4 semaines après une livraison réussie, pas à la facturation.` },
    variants: [],
    keywords: ['référencement', 'referral', 'recommandation', 'intro', 'warm'],
  },
  {
    id: 'maybe-to-yes',
    agent: 'CARDONE',
    category: 'closing',
    title: { fr: 'Transformer un "peut-être" en "oui"' },
    context: { fr: 'Le prospect est chaud, mais hésite. "Peut-être" = un oui bloqué par une petite friction non-nommée.' },
    script: { fr: `Structure : isoler la friction → neutraliser → pousser à la décision.

1. **Isoler la friction**
   → "T'es à combien sur 10 pour dire oui ?"
   → S'il dit 7-8 : "Qu'est-ce qui te manque pour atteindre 10 ?" — il te donne l'objection précise.
   → S'il dit 3-4 : c'est pas un peut-être, c'est un non poli. Va extraire le vrai non.

2. **Neutraliser la friction nommée**
   → Si c'est le budget : reframer le coût.
   → Si c'est le timing : proposer un start flexible.
   → Si c'est la confiance : ajouter une garantie/sortie.

3. **Fermer la boucle**
   → "Si on résout [friction], tu signes aujourd'hui ?"
   → S'il dit oui → tu résous, il signe.
   → S'il hésite encore : il y a une autre objection cachée. Recommence étape 1.` },
    variants: [],
    keywords: ['peut-être', 'hésitation', 'closing', 'objection cachée', 'friction'],
  },
  {
    id: 'reach-out-old-prospect',
    agent: 'CARDONE',
    category: 'prospecting',
    title: { fr: 'Reprendre contact avec un ancien prospect' },
    context: { fr: 'Dossier dormant depuis 6+ mois. Pas de raison de réactiver, sauf que tu en as besoin.' },
    script: { fr: `Structure : prétexte crédible → pas d'excuse pour le gap → offre nouvelle.

1. **Prétexte crédible** (pas "je prenais de tes nouvelles")
   → "Je tombe sur [article/donnée/nouvelle] qui t'aurait intéressé à l'époque."
   → Ou : "Un client [similaire] vient de hit [résultat]. Ça m'a fait penser à toi."

2. **Pas d'excuse pour le gap**
   → NE DIS PAS : "Désolé de pas avoir donné de nouvelles."
   → C'est un signal de faiblesse et ça invite à ignorer.

3. **Offre nouvelle** (pas la même qu'il y a 6 mois)
   → "Depuis notre dernière discussion, je fais aussi [nouveau service / nouveau résultat]. Ça t'intéresse de voir si ça matche ?"

Les prospects dormants reconvertissent à 15-20% avec la bonne raison de réveil.` },
    variants: [],
    keywords: ['dormant', 'ancien prospect', 'réactiver', 'dormant', 'relance longue'],
  },
  {
    id: 'cold-calling-rhythm',
    agent: 'CARDONE',
    category: 'prospecting',
    title: { fr: 'Scaler un cold-calling session' },
    context: { fr: 'Tu bloques 2h pour appeler des prospects. Le rythme fait ou défait la session.' },
    script: { fr: `Structure : batch-mode → script léger → no recovery time.

1. **Batch-mode** (avant la session)
   → Liste de 30+ numéros prête. Ouverts dans un spreadsheet.
   → Pas d'email, pas de Slack, pas de DM.
   → Un timer 2h.

2. **Script léger** (3 lignes max)
   → "Salut [Prénom], [ton nom] de [ton biz]. Est-ce qu'on est à un bon moment pour 60 secondes ?"
   → S'il dit non → "Quand rappeler ?" → raccroche.
   → S'il dit oui → pitch 30s → question ouverte.

3. **No recovery time**
   → Raccroche. Respire 5 secondes. Prochain numéro.
   → PAS d'auto-analyse entre les appels. PAS de "comment j'aurais pu mieux dire ça".
   → Le rythme te sort de ta tête. L'hésitation te tue.

Stat : 30 appels en 2h = 5-7 conversations = 1-2 rendez-vous. C'est le ratio. Joue le volume.` },
    variants: [],
    keywords: ['cold call', 'appels', 'volume', 'rythme', 'discipline'],
  },
  {
    id: 'linkedin-without-spam',
    agent: 'CARDONE',
    category: 'prospecting',
    title: { fr: 'Prospecter sur LinkedIn sans être spammy' },
    context: { fr: 'LinkedIn = gold si tu joues lent. Poubelle si tu blasts.' },
    script: { fr: `Structure : engagement avant pitch → 1 touch visible, 1 touch invisible → DM sur signal.

1. **Engagement avant pitch** (2-3 semaines idéalement, 1 minimum)
   → Commente intelligemment sur 2-3 de ses posts. Pas "Great post!".
   → Apporte un angle, une donnée, une expérience. Il voit ton nom plusieurs fois sans pression.

2. **Connexion + message delayed**
   → Envoie l'invite sans note OU avec 1 ligne référence ("vu ton post sur X").
   → Attend qu'il accepte. **Ne DM pas immédiatement après acceptation** — c'est là que 95% brûlent la relation.
   → Attend 1 semaine. Commente encore 1 fois.

3. **DM sur signal** (il pose une question, il publie un pain point)
   → "Je viens de lire ton post sur [X]. J'ai une perspective qui pourrait t'aider. Veux qu'on en jase 15 min ?"
   → Le signal = le prétexte. Pas de pitch cold.

La règle : le DM doit avoir l'air d'une conversation naturelle, pas d'une séquence automatique.` },
    variants: [],
    keywords: ['linkedin', 'social selling', 'dm', 'connexion', 'engagement'],
  },
  {
    id: 'revive-dead-lead',
    agent: 'CARDONE',
    category: 'prospecting',
    title: { fr: 'Relancer un lead dormant depuis 3+ mois' },
    context: { fr: 'Un prospect chaud, puis silence total. 3 mois. Tu es prêt à fermer le dossier mais pas sans un dernier shot.' },
    script: { fr: `Structure : breakup email → réponse haute → pivot ou ferme.

1. **Breakup email** (1 seul message)
   → Objet : "[Prénom] — je ferme ton dossier"
   → Corps : "Pas de nouvelle depuis [mois]. Je préfère te retirer de ma liste proprement que continuer à te relancer.
   Si le besoin est mort, no stress. Si t'y es encore, un mot et on reprend.
   Sinon, je ferme mardi."

2. **Taux de réponse élevé** (50-60%)
   → Les leads dormants répondent massivement à ce message parce qu'il lève la pression.

3. **Pivot ou ferme**
   → Il répond "encore intéressé" → reprend exactement où tu étais, sans excuse, sans rattrapage.
   → Il répond "plus besoin" → demande un referral. "OK, tu connais quelqu'un qui a encore ce besoin ?"
   → Il ignore → ferme le dossier. Libère ton mental.` },
    variants: [],
    keywords: ['dormant', 'breakup', 'lead mort', 'relance finale', 'réveil'],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // HORMOZI — 8 scénarios (pricing / offers)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'raise-prices-existing',
    agent: 'HORMOZI',
    category: 'pricing',
    title: { fr: 'Augmenter ses prix sans perdre ses clients existants' },
    context: { fr: 'Tes prix n\'ont pas bougé depuis 18+ mois. Tes clients existants payent le prix d\'hier pour du travail d\'aujourd\'hui.' },
    script: { fr: `Structure : justifier par la valeur livrée → timing clair → grandfather avec délai.

1. **Justifier par la valeur** (pas par tes coûts)
   → "Depuis 18 mois, j'ai livré [X résultats spécifiques]. Les clients que j'onboarde aujourd'hui payent [nouveau prix]."
   → Les clients acceptent une hausse liée à ton impact, pas à ton loyer.

2. **Timing clair**
   → Annonce 60 jours avant. Pas 30, pas 90. 60 = assez pour qu'il planifie, pas assez pour chercher un remplaçant activement.

3. **Grandfather partiel** (optionnel, selon relation)
   → "Pour toi, je bloque l'ancien tarif jusqu'au [date précise]. Après ça, c'est le nouveau. Je te donne 4 mois pour te préparer."

Maths : perdre 20% des clients à un prix 40% plus élevé = +12% de revenus avec 20% de charge en moins.` },
    variants: [
      { label: { fr: 'Pour retainers mensuels' }, script: { fr: `Les retainers sont plus sensibles — joue avec plus de soin.

1. **Annonce 90 jours à l'avance** (pas 60) pour retainers.
2. **Hausse modérée** : +15-20% pas +40%. L'incrément doit sembler raisonnable.
3. **Ajout de valeur synchronisée** : "Nouveau tarif + je prends en charge [nouvelle chose]." Un ajout visible désamorce la friction.

Accepte que 1-2 clients vont partir. Remplace-les à plein tarif.` } },
    ],
    keywords: ['augmenter prix', 'hausse', 'pricing', 'clients existants', 'grandfather'],
  },
  {
    id: 'pitch-without-data',
    agent: 'HORMOZI',
    category: 'pricing',
    title: { fr: 'Pitcher sans données (client pilote)' },
    context: { fr: 'Pas de case study, pas de résultats, juste ta méthode. Tu veux que ton premier client en vende 2.' },
    script: { fr: `Structure : acheter la preuve → risk-reversal → scarcity naturelle.

1. **Acheter la preuve** (offre pilote explicite)
   → "Je cherche [2-3] clients pilotes. Le deal : tarif réduit de [50%] en échange d'un case study complet à la fin."
   → Clarifie que c'est limité dans le temps ET limité en nombre.

2. **Risk-reversal serré**
   → "Si après [X jours/semaines] tu n'as pas [résultat minimum défini], tu payes rien."
   → Tu portes 100% du risque. C'est ce qui compense l'absence de preuve.

3. **Scarcity naturelle** (pas fabriquée)
   → "Je prends 2 clients. Après ça, je monte à mon tarif plein."
   → Fais-le vraiment. Le 3ème client paye le plein tarif avec les case studies des 2 premiers.

Objectif : 3 mois pour avoir 3 case studies. Ensuite tu n'as plus jamais besoin de pitcher sans données.` },
    variants: [],
    keywords: ['pilote', 'case study', 'sans preuve', 'premier client', 'risk reversal'],
  },
  {
    id: 'defend-premium-vs-lowcost',
    agent: 'HORMOZI',
    category: 'pricing',
    title: { fr: 'Défendre un prix premium face à la compétition low-cost' },
    context: { fr: 'Un concurrent offre "la même chose" à moitié prix. Comment justifier ton positionnement premium.' },
    script: { fr: `Structure : ne pas comparer sur le prix → reframer la compétition → rendre le low-cost coûteux.

1. **Ne jamais comparer directement sur le prix**
   → Dire "on est meilleurs" = défendre. Tu perds.
   → Dire "on fait une chose différente" = positionner. Tu gagnes.

2. **Reframer la compétition**
   → "Eux font [service générique]. Moi je fais [spécifique + résultat mesuré]."
   → Si le prospect dit "c'est pareil" → tu n'as pas différencié assez.

3. **Rendre le low-cost coûteux**
   → "Leur prix bas = ils doivent prendre 50 clients pour survivre. Je prends 10. Tu veux être le 50ème en queue ou le 10ème qui a mon temps ?"
   → Le coût réel du low-cost = le manque d'attention.

Règle : si tu gagnes sur le prix, tu perds dès qu'un moins cher arrive. Gagne sur autre chose.` },
    variants: [],
    keywords: ['premium', 'concurrence', 'low-cost', 'positionnement', 'différenciation'],
  },
  {
    id: 'grand-slam-offer',
    agent: 'HORMOZI',
    category: 'pricing',
    title: { fr: 'Structurer une offre irrésistible' },
    context: { fr: 'Ton offre actuelle reçoit des "intéressant" mais peu de oui. Grand Slam = stack tellement de valeur que le non devient absurde.' },
    script: { fr: `Structure : dream outcome × perceived likelihood ÷ time delay × effort required.

1. **Dream outcome**
   → Définis le résultat ultime que le client achète (pas la méthode). Chiffre-le.
   → Ex: "Fermer 3 retainers à 1000$/mois en 90 jours" > "Je fais du coaching vente".

2. **Perceived likelihood** (max)
   → Empile : garantie, case study, étape par étape, support actif, refund si échec.
   → Le prospect doit ressentir "j'peux pas perdre".

3. **Time delay** (min)
   → Raccourcis le temps vers le résultat. "Quick win en 7 jours" en plus du résultat final.

4. **Effort required** (min)
   → Fais le job à leur place autant que possible. "Je fais X pour toi" > "Je t'apprends à faire X".

Testez : l'offre devrait sembler stupide de refuser à ton client idéal. Si elle semble "correcte", elle n'est pas assez forte.` },
    variants: [],
    keywords: ['offer', 'grand slam', 'irrésistible', 'valeur', 'stack'],
  },
  {
    id: 'add-bonus-to-close',
    agent: 'HORMOZI',
    category: 'closing',
    title: { fr: 'Introduire un bonus pour closer' },
    context: { fr: 'Le prospect hésite. Un bonus ciblé peut le faire basculer — si le bonus résout sa vraie objection.' },
    script: { fr: `Structure : diagnostiquer l'objection → construire le bonus spécifique → le bonus disparaît si pas "maintenant".

1. **Diagnostiquer l'objection réelle**
   → "C'est quoi qui te retient ?" → il dit ce qui bloque.
   → C'est CE problème que le bonus doit résoudre, pas un bonus générique.

2. **Construire le bonus spécifique**
   → Peur de pas savoir démarrer → "Je t'inclus une session onboarding 1h."
   → Peur du risque → "Je te garantis [résultat minimum] dans X jours."
   → Peur du setup technique → "Je fais la migration pour toi."

3. **Bonus lié au timing**
   → "Ce bonus est valide si tu signes cette semaine. Après, c'est le mandat seul."
   → Pas du faux scarcity. Tu fais vraiment le bonus parce qu'il signe vite.

Ne JAMAIS ajouter un bonus pour baisser le prix déguisé. C'est un rabais, pas un bonus.` },
    variants: [],
    keywords: ['bonus', 'close', 'stack', 'incentive', 'friction'],
  },
  {
    id: 'upfront-payment',
    agent: 'HORMOZI',
    category: 'pricing',
    title: { fr: 'Négocier des paiements anticipés' },
    context: { fr: 'Cash flow > profit. Un paiement 100% upfront vaut plus qu\'un deal 20% plus gros étalé.' },
    script: { fr: `Structure : offrir un trade-off → cadrer comme engagement mutuel → prix psychologique rond.

1. **Offrir un trade-off visible**
   → "Prix normal : [X]/mois sur 6 mois = total Y.
   Upfront 6 mois : Y - [10%] = Z."
   → Le rabais 10% est minime, l'impact cash est énorme.

2. **Cadrer comme engagement mutuel**
   → "Paiement upfront = j'engage toute ma capacité pour toi. Paiement mensuel = tu gardes une sortie, je garde aussi ma flexibilité."
   → Le upfront devient un signal de commitment, pas un truc pour économiser.

3. **Prix psychologique rond**
   → Ne pas dire "8640 au lieu de 9600". Dire "8500".
   → Les chiffres ronds signalent la confiance, pas le désespoir.

Objectif : 30-40% de tes clients upfront dans 6 mois. Transforme ton cash flow.` },
    variants: [],
    keywords: ['paiement anticipé', 'upfront', 'cash flow', 'rabais', 'engagement'],
  },
  {
    id: 'qualify-in-2-questions',
    agent: 'HORMOZI',
    category: 'prospecting',
    title: { fr: 'Qualifier un prospect en 2 questions' },
    context: { fr: 'Tu perds du temps à pitcher des gens qui ne peuvent pas ou ne veulent pas acheter. Qualifier tôt = sauver ta semaine.' },
    script: { fr: `Structure : question de budget → question de timing. Fin.

1. **Question de budget** (frontalement)
   → "Pour résoudre [problème que tu adresses], les gens que j'aide investissent entre [X] et [Y]. Ça rentre dans ce que tu cherches ?"
   → S'il dit oui → continue.
   → S'il dit non → "OK, alors je suis pas la bonne personne pour ça. Je connais [ressource gratuite/pas cher] qui pourrait t'aider — je te l'envoie ?"
   → Tu sors gagnant : le prospect est reconnaissant, tu as sauvé 1h.

2. **Question de timing**
   → "Si on bossait ensemble, tu voudrais commencer quand ?"
   → "Dans 6 mois" = pas maintenant. Stock dans le CRM, rappel dans 4 mois.
   → "Asap" = vrai prospect. Continue.

Ces 2 questions en 90 secondes. Pas de pitch avant. La moitié de tes non seront éliminés avant que tu aies parlé de toi.` },
    variants: [],
    keywords: ['qualifier', 'budget', 'timing', 'BANT', 'filtrer'],
  },
  {
    id: 'competitor-price-comparison',
    agent: 'HORMOZI',
    category: 'objection',
    title: { fr: 'Déjouer un client qui compare avec un concurrent moins cher' },
    context: { fr: '"J\'ai vu [concurrent] à 40% moins cher pour la même chose."' },
    script: { fr: `Structure : valider → exposer les trous → maths de longue-terme.

1. **Valider sans minimiser**
   → "Bien, c'est intelligent de comparer."
   → Ne critique JAMAIS le concurrent directement. Ça te fait passer pour petit.

2. **Exposer les trous par question**
   → "Ils inclent [X spécifique que tu offres] ?"
   → "Combien de révisions ?"
   → "Quel est le délai de livraison ?"
   → Laisse-le découvrir lui-même la différence.

3. **Maths de longue-terme**
   → "Leur offre te coûte [moitié prix]. Mon offre te coûte [plein prix]. Si la mienne te rapporte [X fois plus de revenu / temps sauvé], laquelle est la plus chère réellement ?"
   → Reframer "coût" en "ROI".

Si le prix importe plus que le résultat pour lui : c'est pas ton client. Laisse-le partir gracieusement.` },
    variants: [],
    keywords: ['concurrent', 'comparaison', 'prix', 'ROI', 'valeur'],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // GARYV — 8 scénarios (content / brand / linkedin)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'linkedin-hook-cta',
    agent: 'GARYV',
    category: 'content',
    title: { fr: 'Cold LinkedIn qui convertit' },
    context: { fr: 'Un DM LinkedIn froid qui ne sonne pas comme un template de vente.' },
    script: { fr: `Structure : hook observationnel → valeur spécifique → CTA faible.

1. **Hook observationnel** (ligne 1)
   → "Je vois que tu [action récente observable — ex: viens de lancer X, as posté sur Y, as changé de rôle]."
   → Preuve que tu n'as pas blasté. Le prospect vérifie que tu as vraiment regardé.

2. **Valeur spécifique** (ligne 2)
   → "J'ai remarqué que les [son type de business] qui font [son action] galèrent souvent avec [problème que tu résous]."
   → Pas "je vends X". Tu nommes SA douleur future.

3. **CTA faible** (ligne 3)
   → "Si ça résonne, j'ai un framework 2-bullets qui marche bien pour ça. Tu veux que je te le partage en DM ?"
   → "Tu veux" > "Peut-on" — moins corporate.
   → Accepter coûte rien. Ça ouvre la conversation.

Règle : si le DM peut être envoyé à 100 personnes avec juste le prénom changé, il sera ignoré par les 100. Rends-le impossible à mass-send.` },
    variants: [],
    keywords: ['linkedin', 'dm', 'cold', 'hook', 'cta'],
  },
  {
    id: 'post-about-failure',
    agent: 'GARYV',
    category: 'content',
    title: { fr: 'Écrire un post LinkedIn sur un échec' },
    context: { fr: 'L\'échec bien raconté engage 10x plus que le succès. Mais mal raconté, tu passes pour faible.' },
    script: { fr: `Structure : hook brut → contexte court → leçon actionnable → vulnérabilité stratégique.

1. **Hook brut** (ligne 1, pas de fluff)
   → "J'ai perdu [X] cette semaine." OU "Le client m'a dit : 'on arrête'."
   → Pas de "aujourd'hui je veux partager...". Les gens scrollent.

2. **Contexte court** (2-3 lignes max)
   → Ce qui s'est passé, sans dramatiser.
   → Ta responsabilité dans l'échec (crucial — les victim stories floppent).

3. **Leçon actionnable** (ce qui est utile pour les autres)
   → "Voici ce que je vais faire différemment : [action concrète]."
   → Pas une leçon abstraite. Une décision.

4. **Vulnérabilité stratégique** (optionnel, ligne de fin)
   → "On a tous ces moments. Partage le tien en DM si tu veux qu'on en parle."
   → Ouvre la conversation sans demander du pity.

Règle : raconte comme tu le dirais à un ami, pas à ton CV.` },
    variants: [],
    keywords: ['post linkedin', 'échec', 'vulnérabilité', 'contenu', 'storytelling'],
  },
  {
    id: 'respond-negative-comment',
    agent: 'GARYV',
    category: 'content',
    title: { fr: 'Répondre à un commentaire négatif public' },
    context: { fr: 'Quelqu\'un te challenge ou t\'attaque publiquement sur un post. Ta réponse est plus lue que le commentaire original.' },
    script: { fr: `Structure : séparer signal du bruit → répondre au fond si signal → ignorer si bruit.

**Test signal vs bruit** :
- Critique avec un argument → signal. Réponds.
- Insulte ou attaque personnelle → bruit. Ignore ou bloque.

**Si signal** :
1. **Reconnaître publiquement la valeur**
   → "[Prénom] soulève un bon point sur [X]."
   → Tu montres à l'audience que tu es mature, pas à l'ego.

2. **Répondre au fond, pas à la forme**
   → Adresse l'argument, pas le ton.
   → "Voici pourquoi je vois les choses différemment : [raison courte]."

3. **Laisse la porte ouverte**
   → "On n'est pas obligés d'être d'accord — mais merci de pousser ma réflexion."
   → Ferme avec élégance. Pas besoin du dernier mot.

**Si bruit** :
→ Ignore. Si répété, supprime le commentaire + bloque.
→ Répondre à un troll = lui donner la scène.` },
    variants: [],
    keywords: ['commentaire négatif', 'critique', 'troll', 'réputation', 'public'],
  },
  {
    id: 'ask-linkedin-recommendation',
    agent: 'GARYV',
    category: 'referral',
    title: { fr: 'Demander une recommandation LinkedIn' },
    context: { fr: 'Client content. Pas encore de recommandation publique. Chaque reco = gonfle ton social proof.' },
    script: { fr: `Structure : contexte → demander à un moment précis → fournir la structure.

1. **Le moment optimal**
   → 2-4 semaines après une livraison réussie, quand le résultat est tangible mais encore frais.
   → Pas à la facturation (trop transactionnel). Pas 6 mois plus tard (froid).

2. **Message court et direct**
   → "Content du résultat sur [projet]. Si ça te semble juste, ça me ferait vraiment plaisir que tu laisses une reco LinkedIn — 2-3 lignes suffisent."
   → Pas de long paragraphe suppliant.

3. **Fournir la structure (baisse la friction)**
   → "Pour t'aider, tu peux t'inspirer de : (a) le problème que tu avais · (b) ce qu'on a fait · (c) le résultat concret. 3 lignes et t'es good."
   → Si tu veux être encore plus bold : "Je peux même rédiger un draft si tu veux juste approuver."

Taux d'acceptation avec la structure : ~70%. Sans structure : ~25%.` },
    variants: [],
    keywords: ['linkedin', 'recommandation', 'témoignage', 'social proof', 'reco'],
  },
  {
    id: 'after-viral-post',
    agent: 'GARYV',
    category: 'content',
    title: { fr: 'Relancer un prospect après un post viral' },
    context: { fr: 'Un de tes posts a explosé (plus d\'engagement que d\'habitude). Momentum parfait pour re-tapper les prospects tièdes.' },
    script: { fr: `Structure : ne pas se vanter → utiliser le post comme prétexte → CTA clair.

1. **Ne pas se vanter dans le DM**
   → NE DIS PAS : "Tu as vu mon post qui a fait X likes ?"
   → DIS : "Mon post sur [X] a tapé un nerf cette semaine — beaucoup de gens m'ont DM avec le même problème."

2. **Utiliser le post comme prétexte légitime**
   → "Tu m'avais parlé de [son problème similaire] il y a [délai]. Je voulais te rementionner parce que ça m'a rappelé notre conversation."

3. **CTA clair et non-vendeur**
   → "On reprend où on était, ou c'est plus d'actualité pour toi ?"
   → Respecte sa réponse. S'il dit plus d'actualité, pivot sur un référencement.

Timing : max 7 jours après que le post performe. Après, le momentum retombe.` },
    variants: [],
    keywords: ['viral', 'post', 'momentum', 'relance', 'contenu'],
  },
  {
    id: 'client-to-ambassador',
    agent: 'GARYV',
    category: 'referral',
    title: { fr: 'Transformer un client en ambassadeur' },
    context: { fr: 'Un client performe bien. Tu veux qu\'il te promeuve naturellement dans son réseau.' },
    script: { fr: `Structure : rendre la réussite VISIBLE → faciliter le partage → reconnaître publiquement.

1. **Rendre sa réussite visible**
   → Publie un post (avec permission) sur son projet. Pas "case study" formel — une vraie histoire.
   → "Bossé avec [client] sur [problème]. Résultat : [chiffre]. Voici comment on a fait."

2. **Faciliter le partage**
   → Envoie-lui le post par DM avec : "J'ai écrit ça. Tu tagues ? Tu partages ? Si non c'est cool, mais j'ai pensé que tu voudrais."
   → Beaucoup de clients veulent être vus performant. Offre-leur la scène.

3. **Reconnaître publiquement**
   → Quand il livre quelque chose bien, mentionne-le dans tes posts.
   → Il te verra comme quelqu'un qui bâtit avec lui, pas qui lui extrait juste un chèque.

Ambassadeur naturel > demande directe de référencement. Il te promeut avant même que tu demandes.` },
    variants: [],
    keywords: ['ambassadeur', 'case study', 'tag', 'contenu', 'réseau'],
  },
  {
    id: 'pitch-without-case-study',
    agent: 'GARYV',
    category: 'prospecting',
    title: { fr: 'Pitcher un client sans case study (juste brand)' },
    context: { fr: 'Pas de résultats chiffrés à montrer. Ton brand doit faire le travail. Différent de "pas de preuve" — tu as construit une présence.' },
    script: { fr: `Structure : perspective unique → point de vue public → preuve par cohérence.

1. **Montrer ta perspective unique**
   → Pas "je fais X depuis Y années". Ça ne prouve rien.
   → "Voici comment je vois [problème du client] : [point de vue précis, potentiellement controversé]."
   → Une perspective assumée = différenciation immédiate.

2. **Point de vue public cohérent**
   → Pointe ton feed LinkedIn, tes posts, tes contenus.
   → "Si tu veux voir comment je pense, regarde ce que j'ai posté sur [sujet]."
   → Ton contenu = ta preuve. Pas de chiffres, mais une vision traçable.

3. **Preuve par cohérence**
   → "Je dis [X]. Je fais [X]. Je recommande [X]. Regarde si ça tient."
   → Le prospect voit si ta réalité match ton discours. C'est plus fort qu'un case study.

Règle : si ton contenu public est tiède ou inconsistant, cette approche ne marche pas. Corrige ça avant de pitcher.` },
    variants: [],
    keywords: ['brand', 'pas de preuve', 'point de vue', 'contenu', 'autorité'],
  },
  {
    id: 'handle-troll',
    agent: 'GARYV',
    category: 'content',
    title: { fr: 'Gérer un troll sur un post public' },
    context: { fr: 'Quelqu\'un attaque ton post avec mauvaise foi. Il veut t\'épuiser. L\'audience regarde comment tu réagis.' },
    script: { fr: `Structure : 1 réponse calme → disengage → action si persiste.

1. **Une seule réponse publique** (calme, respectueuse)
   → "Je ne vois pas les choses comme toi. Je respecte ton angle."
   → Tu montres à l'audience que tu peux recevoir la critique. Tu ne t'engages pas dans la guerre.

2. **Disengage immédiatement**
   → Après ta réponse, arrête.
   → S'il répond encore, NE réponds pas. Les gens voient le déséquilibre.
   → Le troll veut du conflit — lui retirer le conflit le désarme.

3. **Action si persiste / toxicité**
   → Si commentaires répétés ou insultants : supprime + bloque.
   → "Tu peux débattre sans insulter. Sinon tu perds l'accès à l'espace."
   → Tu protèges ton audience (notamment les lurkers silencieux qui apprécient mais ne commentent pas).

Règle cardinale : jamais répondre quand tu es énervé. 20 minutes de délai minimum. La plupart des messages énervés ne sont jamais envoyés après 20 minutes.` },
    variants: [],
    keywords: ['troll', 'commentaire', 'attaque', 'modération', 'réputation'],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ROBBINS — 7 scénarios (mindset)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'before-big-call',
    agent: 'ROBBINS',
    category: 'mindset',
    title: { fr: 'Avant un gros appel' },
    context: { fr: '10 minutes avant l\'appel qui peut changer ton mois. Ta tête sabote tout.' },
    script: { fr: `Structure : physio → focus → reframe.

1. **Physio** (change ton corps pour changer ton état)
   → Debout. Épaules en arrière. 60 secondes.
   → 10 respirations profondes : inspire 4, retient 4, expire 6.
   → Ton corps mène. Ta tête suit.

2. **Focus** (d'où tu parles, pas ce que tu vends)
   → Question mentale : "Qu'est-ce que je peux lui donner dans cet appel, peu importe s'il achète ?"
   → Ton focus glisse de "j'ai besoin du deal" à "je veux aider". L'autre le sent.

3. **Reframe** (tu ne passes pas un examen)
   → "Cet appel est une conversation, pas un test."
   → "Je ne perds rien s'il dit non. Je n'ai pas ce client depuis le début."

Vérité dure : le deal n'est pas là dans l'appel. Il est dans ton état AVANT l'appel.` },
    variants: [],
    keywords: ['préparation', 'appel', 'stress', 'physio', 'état'],
  },
  {
    id: 'after-brutal-no',
    agent: 'ROBBINS',
    category: 'mindset',
    title: { fr: 'Après un refus brutal' },
    context: { fr: 'Il t\'a dit non d\'une manière qui fait mal. Le truc qui tue, c\'est pas le non, c\'est l\'histoire que tu te racontes après.' },
    script: { fr: `Structure : nommer l'émotion → séparer le fait de l'histoire → bouger le corps.

1. **Nommer l'émotion** (5 secondes)
   → "Je ressens [honte / colère / déception / doute]." Dis-le à voix haute.
   → Ne pas nommer = rester dedans. Nommer = sortir de dedans.

2. **Séparer le fait de l'histoire**
   → Le FAIT : "Il a dit non."
   → L'HISTOIRE que tu te racontes : "Je suis nul. Mon offre est mauvaise. J'aurais jamais dû appeler."
   → Écris les deux. Vois comme ton histoire dépasse le fait.
   → Un non = une transaction qui n'a pas matché, point.

3. **Bouger le corps**
   → 20 minutes de marche, course, push-ups.
   → Ton système nerveux doit métaboliser l'émotion. Tu ne peux pas penser ton chemin hors de ça — tu dois BOUGER ton chemin.

Action : après avoir bougé, fais le prochain appel. Pas le même lead. Le suivant. Casse le pattern.` },
    variants: [],
    keywords: ['refus', 'rejet', 'brutalité', 'récupération', 'état'],
  },
  {
    id: 'procrastination-blocked',
    agent: 'ROBBINS',
    category: 'mindset',
    title: { fr: 'Quand la procrastination bloque' },
    context: { fr: 'Tu sais ce qu\'il faut faire. Tu ne le fais pas. Pas de blocage énergétique — c\'est un blocage émotionnel.' },
    script: { fr: `Structure : diagnostiquer la vraie peur → réduire la tâche au minimum → 2-minute rule.

1. **Diagnostiquer la vraie peur**
   → Pas "je suis paresseux". C'est jamais ça.
   → Les 4 peurs standards : (a) peur du rejet (j'appelle, il dit non) · (b) peur de l'échec (je lance, ça marche pas) · (c) peur du succès (si ça marche, je dois scaler) · (d) perfectionnisme (pas prêt = excuse).
   → Écris : "Ce que j'évite vraiment en ne faisant pas ça, c'est : [peur spécifique]."

2. **Réduire la tâche au minimum viable**
   → "Faire 5 cold calls" → "Ouvrir mon CRM et regarder les 5 premiers noms."
   → "Écrire la proposition" → "Ouvrir le doc et taper le titre."
   → Le cerveau résiste au grand saut, pas au petit.

3. **2-minute rule**
   → Engage-toi pour 2 minutes. Un chrono. Tu peux arrêter après.
   → 80% du temps, tu continues. Les 20% restants, tu as au moins cassé l'inertie.

La procrastination se nourrit du gap entre "ce que je dois faire" et "ce que je fais". Rapproche les deux par petits pas.` },
    variants: [],
    keywords: ['procrastination', 'blocage', 'action', 'petit pas', 'peur'],
  },
  {
    id: 'imposter-syndrome',
    agent: 'ROBBINS',
    category: 'mindset',
    title: { fr: 'Syndrome de l\'imposteur avant un pitch' },
    context: { fr: '"Qui suis-je pour dire à ce client quoi faire ?". La voix qui te rétrécit juste avant le moment où tu dois être grand.' },
    script: { fr: `Structure : inventorier les preuves → reframer la position → re-focus sur le service.

1. **Inventorier les preuves** (2 minutes, écrites)
   → "J'ai aidé [X personnes / situations] à [résultat spécifique]."
   → Liste 3-5 preuves concrètes. Ton cerveau en panique oublie ce que tu sais.
   → Ces preuves existent. Ton doute est une fiction narrative.

2. **Reframer la position**
   → FAUX : "Je dois tout savoir pour mériter d'être payé."
   → VRAI : "Je dois en savoir plus que le client sur CE problème précis."
   → Tu es l'expert relatif. Pas l'expert absolu. Personne ne l'est.

3. **Re-focus sur le service**
   → Question : "Si je mets mon ego de côté, est-ce que cette personne aura une meilleure journée/semaine/année grâce à moi ?"
   → Si oui → tu as la légitimité.
   → Le syndrome de l'imposteur = ego. L'ego demande "suis-je assez bon". Le service demande "comment j'aide".

Vérité : les gens qui te payent n'attendent pas ta perfection. Ils attendent ton action.` },
    variants: [],
    keywords: ['imposteur', 'doute', 'légitimité', 'pitch', 'confiance'],
  },
  {
    id: 'week-without-close',
    agent: 'ROBBINS',
    category: 'mindset',
    title: { fr: 'Après une semaine sans close' },
    context: { fr: 'Zéro deal. Ton cerveau commence à raconter que "c\'est fini". Ce récit, s\'il n\'est pas coupé, devient une prophétie.' },
    script: { fr: `Structure : séparer données de narrative → analyser, pas ruminer → action asymétrique.

1. **Séparer les données de la narrative**
   → DONNÉES : "0 close cette semaine, 12 conversations eues, 3 rendez-vous prévus, 1 deal en attente."
   → NARRATIVE : "Ça marche pas. Je dois changer de métier. Les gens n'ont plus de budget."
   → Les données sont factuelles. La narrative est une interprétation. Elles ne sont pas la même chose.

2. **Analyser, pas ruminer**
   → Ruminer : re-jouer les échecs en boucle sans rien en tirer.
   → Analyser : "Dans mes 12 conversations, qu'est-ce qui s'est répété ? Qu'est-ce qui a manqué ?"
   → L'analyse change la semaine suivante. La rumination te vole la semaine suivante aussi.

3. **Action asymétrique** (refuser le pattern)
   → Fais une chose que tu ne fais pas d'habitude : appelle 5 anciens clients (pas des prospects).
   → Une action qui brise le pattern = un signal au cerveau que la semaine n'est pas foutue.
   → Les 3 meilleurs deals de ta vie viennent souvent de comportements inhabituels.

Rappel : une semaine blanche dans une vie active = normal. Une semaine blanche qui bascule en 3 semaines blanches = une identité naissante.` },
    variants: [],
    keywords: ['zero close', 'dry spell', 'rumination', 'narrative', 'action'],
  },
  {
    id: 'fear-of-charging-more',
    agent: 'ROBBINS',
    category: 'mindset',
    title: { fr: 'Peur de demander plus cher' },
    context: { fr: 'Tu sais que ton prix est trop bas. Mais dire le vrai prix te fait sentir imposteur ou gourmand. Ce blocage te coûte des milliers.' },
    script: { fr: `Structure : nommer la croyance → vérifier sa source → reframer par le résultat.

1. **Nommer la croyance**
   → "Je ne peux pas demander X parce que : [la phrase exacte]."
   → Exemples courants : "Personne ne va payer ça" / "Ce serait gourmand" / "Je ne mérite pas ça".
   → La phrase est rarement la tienne. Elle vient d'un parent, d'un prof, d'un pair.

2. **Vérifier sa source** (data check)
   → "Est-ce que j'ai des preuves que X ne peut pas être payé ? Ou juste une supposition ?"
   → Regarde ta niche. Quelqu'un d'autre charge déjà ce prix. Ça prouve que le prix existe dans le marché.

3. **Reframer par le résultat client**
   → Arrête de penser "ce que je mérite". Pense "ce que ça vaut pour lui".
   → Si ton service fait économiser 50k à un client, charger 10k n'est pas gourmand — c'est 5x ROI pour lui.
   → Prix bas = lui faire un mauvais deal caché derrière "je suis humble".

Action cette semaine : quote ton prochain prospect à 30% de plus que ton tarif habituel. Juste pour voir. Surprise : la moitié dit oui sans broncher.` },
    variants: [],
    keywords: ['pricing', 'confiance', 'valeur', 'demander plus', 'blocage'],
  },
  {
    id: 'doubt-during-negotiation',
    agent: 'ROBBINS',
    category: 'mindset',
    title: { fr: 'Gérer le doute en cours de négociation' },
    context: { fr: 'En live avec le prospect, il pousse, tu sens ton état vaciller. Ta tête te dit de céder pour finir.' },
    script: { fr: `Structure : pause tactique → physio → recentrage sur la valeur.

1. **Pause tactique** (1-2 secondes max, mais précieuse)
   → "Bonne question. Je veux te donner une réponse claire — une seconde."
   → Tu gagnes du temps sans trahir ton état. L'autre interprète ça comme de la considération.

2. **Physio** (invisible)
   → Pieds au sol, respire par le ventre.
   → Quand tu es stressé, tu respires court et ton corps te dit "cède". Casse ça.

3. **Recentrage sur la valeur** (question interne)
   → "Est-ce que ce deal, à cette condition, est bon pour MOI dans 6 mois ?"
   → Si oui → continue à négocier sereinement.
   → Si non → "Je pense qu'on n'arrive pas à aligner ça ici. Pas de problème, on peut en rester là."
   → Tu montres que tu peux marcher. C'est souvent à ce moment que l'autre change de ton.

Vérité en négociation : celui qui peut partir en premier a le pouvoir. La peur de perdre le deal te le fait perdre.` },
    variants: [],
    keywords: ['négociation', 'doute', 'live', 'pause', 'état'],
  },

  // ═══════════════════════════════════════════════════════════════════════
  // NAVAL — 7 scénarios (leverage / systems)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'say-no-misaligned-client',
    agent: 'NAVAL',
    category: 'leverage',
    title: { fr: 'Refuser un client pas aligné' },
    context: { fr: 'Le projet paye bien mais te pousse dans une direction que tu ne veux pas. Le dire non maintenant économise 6 mois de regret.' },
    script: { fr: `Structure : décider sur tes critères → refuser avec élégance → laisser une porte ouverte utile.

1. **Décider sur tes critères** (pas les siens)
   → Questions : (a) Est-ce que ça me rapproche de mes objectifs 3 ans ? (b) Est-ce que je serai fier du résultat ? (c) Est-ce que je vais apprendre ?
   → Si 2/3 non → passe, peu importe le montant.

2. **Refuser avec élégance**
   → "J'ai bien réfléchi. Je réalise que je ne suis pas la bonne personne pour ça. Mon focus actuel est [ta direction], et ton projet demanderait [écart], ce qui ne servirait ni toi ni moi."
   → Clarté + respect. Pas d'excuse fausse ("je suis trop occupé").

3. **Laisser une porte utile**
   → "Par contre, je connais [personne/type de personne] qui pourrait matcher. Veux que je fasse une intro ?"
   → Tu refuses le deal mais tu gagnes en autorité de référenceur.

Principe Naval : "Plus tu dis non aux mauvaises opportunités, plus les bonnes remarquent que tu existes."` },
    variants: [],
    keywords: ['refuser', 'alignement', 'non', 'focus', 'critères'],
  },
  {
    id: 'refuse-urgent-project',
    agent: 'NAVAL',
    category: 'leverage',
    title: { fr: 'Dire non à un projet urgent qui ne scale pas' },
    context: { fr: 'Client offre un gros mandat, mais c\'est custom à 100%. Pas d\'asset réutilisable. Pas de leçon transposable.' },
    script: { fr: `Structure : évaluer le coût caché → négocier vers du réutilisable → décliner si impossible.

1. **Évaluer le coût caché**
   → Cash gagné : [X]
   → Temps investi : [Y heures]
   → Asset créé (réutilisable) : [souvent zéro]
   → Apprentissage transposable : [souvent zéro]
   → Coût d'opportunité (ce que tu n'auras pas fait) : [tes side-projects, ton propre produit]

2. **Négocier vers du réutilisable**
   → "Je peux le faire si on intègre [élément qui crée un asset chez toi — template, framework, process documenté]."
   → Tu transformes un deal linéaire en deal à levier.

3. **Décliner si impossible**
   → "C'est un super projet, mais il ne matche pas ma stratégie actuelle de construire [asset X]. Je vais devoir passer."
   → Sentir la fierté, pas le regret. Le custom-one-off est un piège doré.

Règle Naval : "Construis pendant que les autres vendent." Chaque heure custom = une heure pas sur ton asset.` },
    variants: [],
    keywords: ['urgent', 'custom', 'scale', 'asset', 'levier'],
  },
  {
    id: 'automate-frequent-response',
    agent: 'NAVAL',
    category: 'leverage',
    title: { fr: 'Automatiser une réponse fréquente' },
    context: { fr: 'Tu reçois la même question 10x par semaine. Tu réponds 10x individuellement. C\'est ton temps que tu brûles.' },
    script: { fr: `Structure : capturer le pattern → créer l'asset une fois → pointer vers l'asset pour toujours.

1. **Capturer le pattern** (1 fois)
   → Les 5 prochaines fois que quelqu'un te pose la question, note-la mot pour mot.
   → Note ta réponse aussi. Repère ce qui est vraiment universel vs contextuel.

2. **Créer l'asset une fois** (investissement)
   → Transforme ta réponse en : article de blog, thread Twitter, vidéo YouTube 3 minutes, PDF téléchargeable, page de ton site.
   → Format qui dure des années. Pas un Slack message.

3. **Pointer vers l'asset pour toujours**
   → "Super question. Je couvre ça ici : [lien]. Si tu as des questions après, reviens vers moi."
   → Tu réponds vraiment mieux qu'un DM rushé. Le client reçoit plus. Ton temps est libéré.

Multiplié par 10 questions récurrentes → 10 assets → des heures/semaine reconquises pour toujours. Tu construis une bibliothèque qui répond à ta place.

Test : si tu as dit la même phrase 3 fois ce mois, elle doit vivre ailleurs que dans ta bouche.` },
    variants: [],
    keywords: ['automatiser', 'asset', 'FAQ', 'système', 'levier'],
  },
  {
    id: 'choose-between-opportunities',
    agent: 'NAVAL',
    category: 'leverage',
    title: { fr: 'Choisir entre 2 opportunités' },
    context: { fr: 'Opportunité A = argent immédiat, volume. Opportunité B = long terme, levier, asset. Tu ne peux pas faire les deux sérieusement.' },
    script: { fr: `Structure : comparer en 4 dimensions → compter le temps, pas le cash → choisir B 70% du temps.

1. **Comparer en 4 dimensions** (grille)

   |                           | A (cash now)   | B (leverage) |
   |---------------------------|----------------|--------------|
   | Cash en 30 jours          | X$             | Y$           |
   | Cash en 12 mois           | X$ × N         | Y$ × N²      |
   | Asset créé                | non            | oui          |
   | Apprentissage              | faible         | élevé        |

2. **Compter le temps, pas le cash**
   → Option A : "Je recommence chaque mois."
   → Option B : "Je construis quelque chose qui m'aide en août sans que j'y touche."
   → Le cash peut mentir. Le temps libéré ne ment jamais.

3. **Choisir B 70% du temps**
   → Si ta survie est en jeu → A (cash immédiat).
   → Si ta survie va, mais ta progression stagne → B (levier).
   → La plupart des freelances restent dans A par peur. C'est ce qui les garde freelances.

Principe Naval : "Le levier tue le volume." Une heure investie dans un asset vaut 100 heures vendues à l'heure.` },
    variants: [],
    keywords: ['choix', 'opportunité', 'levier', 'long terme', 'asset'],
  },
  {
    id: 'charge-by-value-not-hours',
    agent: 'NAVAL',
    category: 'pricing',
    title: { fr: 'Facturer selon la valeur vs l\'heure' },
    context: { fr: 'Tu vends du temps. Ton revenue plafonne à 24h × ton taux horaire. Pricing à la valeur brise ce plafond.' },
    script: { fr: `Structure : identifier l'outcome chiffrable → pricing à % de la valeur créée → migrer graduellement.

1. **Identifier l'outcome chiffrable**
   → "Si je livre ce mandat, combien ça rapporte au client ?"
   → Pas une estimation vague. Un chiffre défendable.
   → Ex: "Ce funnel te rapportera ~50k sur 6 mois."

2. **Pricing à % de la valeur créée**
   → Règle de base : 10-20% de la valeur créée.
   → 50k créé → tu charges 5-10k, pas 40h × 100$/h = 4k.
   → Même travail. 2x le prix. Parce que tu vends le résultat, pas le temps.

3. **Migrer graduellement**
   → Ne fais pas le switch sur 100% de tes clients demain.
   → Commence par 1-2 nouveaux clients en value-based. Garde les anciens en taux horaire en legacy.
   → Après 6 mois, tu as deux livres de prix. Tu sors les taux horaires.

Signal que tu es prêt : tu refuses les demandes "combien t'es à l'heure ?" avec : "Je ne charge pas à l'heure. Je charge selon le résultat qu'on vise ensemble."` },
    variants: [],
    keywords: ['value-based', 'pricing', 'heure', 'outcome', 'plafond'],
  },
  {
    id: 'delegate-recurring-task',
    agent: 'NAVAL',
    category: 'leverage',
    title: { fr: 'Déléguer une tâche récurrente à un outil' },
    context: { fr: 'Tu fais la même tâche manuellement 3-5x par semaine. Un outil ou un script peut le faire à ta place en continu.' },
    script: { fr: `Structure : inventorier les tâches répétées → évaluer automation vs délégation humaine → investir le temps initial.

1. **Inventorier les tâches répétées** (1 semaine)
   → Note chaque tâche répétitive pendant 7 jours. Durée, fréquence.
   → Tu verras : entre 8-15 heures/semaine brûlées sur du récurrent.

2. **Évaluer : automation (outil) vs délégation humaine**
   → Tâche purement logique → outil (Zapier, Make, un script).
   → Tâche qui demande jugement → humain (VA, freelance).
   → Tâche hybride → Claude/GPT dans un workflow.

3. **Investir le temps initial sans flincher**
   → Automatiser prend 2-8 heures au début. Les gens refusent parce que c'est "trop de temps".
   → Maths : 3h d'automation × 1 setup = 3h. Tu récupères 2h/semaine = 100h/an. ROI 33x.
   → C'est le setup-avoidance qui te garde dans le recurrent manuel.

Règle Naval : "Ton temps devrait être vendu à des marchés, pas à des tâches." Chaque tâche déléguée libère une heure pour créer, penser, construire.` },
    variants: [],
    keywords: ['déléguer', 'automation', 'outil', 'récurrent', 'levier'],
  },
  {
    id: 'build-asset-instead-of-sell-hour',
    agent: 'NAVAL',
    category: 'leverage',
    title: { fr: 'Construire un asset au lieu de vendre une heure' },
    context: { fr: 'Chaque vendredi, tu re-zéro le compteur. Un asset — cours, template, SaaS, communauté — continue à générer du revenue pendant que tu dors.' },
    script: { fr: `Structure : choisir le bon asset → bloquer 4h/semaine ininterrompu → shipper une v1 moche.

1. **Choisir le bon asset** (par ordre de difficulté)
   → **Template/PDF** (1-2 semaines) — transformer ton process en téléchargeable payant.
   → **Cours court** (1-2 mois) — vidéo ou écrit, 5-10 modules, vendu 100-500$.
   → **SaaS micro** (3-6 mois) — outil qui résout un problème que tu as toi-même.
   → **Communauté/programme** (6+ mois) — accès à toi + contenu structuré.

2. **Bloquer 4h/semaine ininterrompu**
   → Même tranche chaque semaine. Sacré. Non-négociable.
   → Tu peux pas. Tu peux toujours. La question est : est-ce une priorité ou juste une intention ?

3. **Shipper une v1 moche**
   → Les assets parfaits ne shippent jamais. Les assets shippent moches et s'améliorent avec feedback.
   → V1 = 60% de ce que tu imagines. Vends-le. Les 3 premiers clients te disent ce qui manque.

Vérité : un an sans asset → tu es un contractor. Un an avec un asset en prod → tu deviens un business. Même toi.` },
    variants: [],
    keywords: ['asset', 'produit', 'levier', 'passif', 'construire'],
  },
];

/**
 * Search by keyword across title + context + script + keywords.
 * Case-insensitive, accent-insensitive, AND-mode for multi-word queries.
 */
export function searchSituations(situations, query, lang = 'fr') {
  if (!query || !query.trim()) return situations;
  const normalize = (s) => (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return situations;

  return situations.filter((s) => {
    const haystack = [
      s.title?.[lang] || '',
      s.context?.[lang] || '',
      s.script?.[lang] || '',
      (s.keywords || []).join(' '),
      (s.variants || []).map((v) => (v.label?.[lang] || '') + ' ' + (v.script?.[lang] || '')).join(' '),
    ].map(normalize).join(' | ');
    return words.every((w) => haystack.includes(w));
  });
}

/** Filter by category id (null = all). */
export function filterByCategory(situations, categoryId) {
  if (!categoryId) return situations;
  return situations.filter((s) => s.category === categoryId);
}

/** Filter by agent key (null = all). */
export function filterByAgent(situations, agentKey) {
  if (!agentKey) return situations;
  return situations.filter((s) => s.agent === agentKey);
}
