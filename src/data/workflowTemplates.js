/**
 * Make.com workflow templates — pre-validated skeletons.
 *
 * Each skeleton contains {{PLACEHOLDERS}} that the LLM fills based on user
 * answers. Module types, versions, and connection shapes are fixed so the
 * resulting JSON is guaranteed importable into Make.com.
 */

export const WORKFLOW_TEMPLATES = [
  // ──────────────────────────────────────────────────────────────────────
  {
    id:          'google_reviews',
    name:        'Réponses avis Google',
    nameEn:      'Google Reviews Responder',
    emoji:       '⭐',
    description: "Quand un avis Google arrive chez ton client, Claude rédige une réponse personnalisée que ton client approuve avant publication.",
    descriptionEn: "When a Google review arrives at your client's business, Claude drafts a personalized reply your client approves before posting.",
    complexityBase: 3,
    defaultVolume: 20, // reviews per month
    questions: [
      { key: 'clientName', label: 'Nom du client',                     labelEn: "Client's business name",    type: 'text',   placeholder: 'Ex: Restaurant Dubé' },
      { key: 'industry',   label: 'Dans quelle industrie est ton client ?', labelEn: "What's your client's industry?", type: 'select', options: ['Restaurant','Salon','Garage','Clinique','Boulangerie','Dépanneur','Gym','Spa','Autre'] },
      { key: 'tools',      label: 'Ton client utilise quels outils ?',  labelEn: 'What tools does your client use?', type: 'multi', options: ['Google Business','Gmail','Slack','Notion','Sheets','Aucun'] },
      { key: 'volume',     label: "Combien d'avis ton client reçoit par mois ?", labelEn: 'How many reviews does your client get per month?', type: 'number', placeholder: '20' },
      { key: 'budget',     label: "Quel est le budget mensuel de ton client ?", labelEn: "What's your client's monthly budget?", type: 'select', options: ['< 200$','200-500$','500-1000$','1000+$'] },
    ],
    makeJsonSkeleton: {
      name: 'NT Solutions — {{CLIENT_NAME}} — Réponses avis Google',
      flow: [
        {
          id: 1,
          module: 'google-my-business:watchReviews',
          version: 1,
          parameters: {
            locationId: '{{GBP_LOCATION_ID}}',
          },
          metadata: { designer: { x: 0, y: 0 } },
        },
        {
          id: 2,
          module: 'anthropic-claude:CreateAMessage',
          version: 1,
          parameters: {
            model: 'claude-sonnet-4-5',
            max_tokens: 400,
            system: '{{SYSTEM_PROMPT}}',
            messages: [
              { role: 'user', content: 'Avis de {{ `{{1.reviewer.displayName}}` }} ({{ `{{1.starRating}}` }}/5) : {{ `{{1.comment}}` }}' },
            ],
          },
          metadata: { designer: { x: 300, y: 0 } },
        },
        {
          id: 3,
          module: 'gmail:SendEmail',
          version: 2,
          parameters: {
            to:      ['{{APPROVAL_EMAIL}}'],
            subject: 'Réponse avis {{CLIENT_NAME}} — à valider',
            contentType: 'text',
            content: 'Avis {{ `{{1.starRating}}` }}★ de {{ `{{1.reviewer.displayName}}` }} :\n\n{{ `{{1.comment}}` }}\n\n---\nRéponse proposée :\n\n{{ `{{2.content[].text}}` }}\n\nValide + copie dans Google Business Profile.',
          },
          metadata: { designer: { x: 600, y: 0 } },
        },
      ],
      metadata: {
        instant: true,
        version: 1,
        scenario: { roundtrips: 1, maxErrors: 3, autoCommit: true, autoCommitTriggerLast: true, sequential: false, confidential: false, dataloss: false, dlq: false },
        designer: { orphans: [] },
      },
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  {
    id:          'prospect_followup',
    name:        'Relance prospects auto',
    nameEn:      'Prospect follow-up sequence',
    emoji:       '🎯',
    description: "Dès qu'un prospect est ajouté au Sheets/Notion de ton client, envoie 2 emails espacés avec copies personnalisées — pour ton client, pas pour toi.",
    descriptionEn: "When a prospect is added to your client's Sheets/Notion, send 2 spaced emails with personalized copy — for your client, not you.",
    complexityBase: 5,
    defaultVolume: 15,
    questions: [
      { key: 'clientName', label: 'Nom du client',                       labelEn: "Client's business name",           type: 'text',   placeholder: 'Ex: Agence XYZ' },
      { key: 'industry',   label: 'Quelle industrie ton client cible ?',   labelEn: 'What industry is your client targeting?', type: 'select', options: ['B2B services','Restaurant','Salon','Garage','E-commerce','Pro services','Autre'] },
      { key: 'tools',      label: 'Ton client utilise quels outils ?',    labelEn: 'What tools does your client use?', type: 'multi',  options: ['Google Sheets','Notion','Airtable','Gmail','Outlook','HubSpot','Aucun'] },
      { key: 'volume',     label: 'Combien de prospects ton client ajoute par semaine ?', labelEn: 'How many prospects does your client add per week?', type: 'number', placeholder: '15' },
      { key: 'budget',     label: 'Quel est le budget mensuel de ton client ?', labelEn: "What's your client's monthly budget?", type: 'select', options: ['< 300$','300-800$','800-1500$','1500+$'] },
    ],
    makeJsonSkeleton: {
      name: 'NT Solutions — {{CLIENT_NAME}} — Relance prospects',
      flow: [
        { id: 1, module: 'google-sheets:watchRows',    version: 4, parameters: { spreadsheetId: '{{SHEET_ID}}', sheetName: 'Prospects' }, metadata: { designer: { x: 0, y: 0 } } },
        { id: 2, module: 'anthropic-claude:CreateAMessage', version: 1, parameters: { model: 'claude-sonnet-4-5', max_tokens: 300, system: '{{SYSTEM_EMAIL_1}}', messages: [{ role:'user', content:'Prospect : {{ `{{1.name}}` }}, {{ `{{1.business}}` }}, {{ `{{1.industry}}` }}' }] }, metadata: { designer: { x: 300, y: 0 } } },
        { id: 3, module: 'gmail:SendEmail',            version: 2, parameters: { to: ['{{ `{{1.email}}` }}'], subject: '{{SUBJECT_1}}', contentType: 'text', content: '{{ `{{2.content[].text}}` }}' }, metadata: { designer: { x: 600, y: 0 } } },
        { id: 4, module: 'util:Sleep',                 version: 1, parameters: { duration: 259200 }, metadata: { designer: { x: 900, y: 0 } } }, // 3 days
        { id: 5, module: 'anthropic-claude:CreateAMessage', version: 1, parameters: { model: 'claude-sonnet-4-5', max_tokens: 300, system: '{{SYSTEM_EMAIL_2}}', messages: [{ role:'user', content:'Relance 2 pour {{ `{{1.name}}` }}' }] }, metadata: { designer: { x: 1200, y: 0 } } },
        { id: 6, module: 'gmail:SendEmail',            version: 2, parameters: { to: ['{{ `{{1.email}}` }}'], subject: '{{SUBJECT_2}}', contentType: 'text', content: '{{ `{{5.content[].text}}` }}' }, metadata: { designer: { x: 1500, y: 0 } } },
      ],
      metadata: { instant: false, version: 1, scenario: { roundtrips: 1, maxErrors: 3, autoCommit: true, sequential: true, confidential: false, dataloss: false }, designer: { orphans: [] } },
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  {
    id:          'auto_invoicing',
    name:        'Facturation automatique',
    nameEn:      'Auto-invoicing',
    emoji:       '💸',
    description: "Quand ton client encaisse un nouveau client via Stripe → facture émise + email de bienvenue + ligne ajoutée au ledger Notion de ton client.",
    descriptionEn: "When your client signs a new customer via Stripe → invoice issued + welcome email + entry in your client's Notion ledger.",
    complexityBase: 4,
    defaultVolume: 10,
    questions: [
      { key: 'clientName', label: 'Nom du client',                          labelEn: "Client's business name",         type: 'text',   placeholder: 'Ex: Dubé Auto' },
      { key: 'industry',   label: 'Dans quelle industrie est ton client ?', labelEn: "What's your client's industry?", type: 'select', options: ['Services pro','E-commerce','SaaS','Restaurant','Salon','Autre'] },
      { key: 'tools',      label: 'Ton client utilise quels outils ?',      labelEn: 'What tools does your client use?', type: 'multi',  options: ['Stripe','Square','QuickBooks','Notion','Sheets','Gmail','Aucun'] },
      { key: 'volume',     label: 'Combien de factures ton client émet par mois ?', labelEn: 'How many invoices does your client issue per month?', type: 'number', placeholder: '10' },
      { key: 'budget',     label: 'Quel est le budget mensuel de ton client ?', labelEn: "What's your client's monthly budget?", type: 'select', options: ['< 200$','200-500$','500-1000$','1000+$'] },
    ],
    makeJsonSkeleton: {
      name: 'NT Solutions — {{CLIENT_NAME}} — Facturation auto',
      flow: [
        { id: 1, module: 'stripe:watchCustomers',     version: 1, parameters: { event: 'customer.created' }, metadata: { designer: { x: 0, y: 0 } } },
        { id: 2, module: 'stripe:createInvoice',      version: 1, parameters: { customer: '{{ `{{1.id}}` }}', auto_advance: true, collection_method: 'send_invoice', days_until_due: 15, description: '{{INVOICE_DESCRIPTION}}' }, metadata: { designer: { x: 300, y: 0 } } },
        { id: 3, module: 'gmail:SendEmail',           version: 2, parameters: { to: ['{{ `{{1.email}}` }}'], subject: 'Bienvenue {{CLIENT_NAME}} — ta facture est en route', contentType: 'text', content: '{{WELCOME_EMAIL_BODY}}' }, metadata: { designer: { x: 600, y: 0 } } },
        { id: 4, module: 'notion:createDatabaseItem', version: 2, parameters: { databaseId: '{{NOTION_DB_ID}}', properties: { Client: { title: [{ text: { content: '{{ `{{1.name}}` }}' } }] }, Email: { email: '{{ `{{1.email}}` }}' }, InvoiceId: { rich_text: [{ text: { content: '{{ `{{2.id}}` }}' } }] }, Amount: { number: '{{ `{{2.amount_due}}` }}' } } }, metadata: { designer: { x: 900, y: 0 } } },
      ],
      metadata: { instant: true, version: 1, scenario: { roundtrips: 1, maxErrors: 3, autoCommit: true, sequential: true, confidential: false, dataloss: false }, designer: { orphans: [] } },
    },
  },

  // ──────────────────────────────────────────────────────────────────────
  {
    id:          'intelligent_answering',
    name:        'Répondeur intelligent',
    nameEn:      'Intelligent answering machine',
    emoji:       '📞',
    description: "Appel manqué sur le Twilio de ton client → transcription → Claude résume + propose action → SMS de rappel auto + notification envoyée à ton client.",
    descriptionEn: "Missed call on your client's Twilio → transcribe → Claude summarizes + proposes action → auto-callback SMS + notification to your client.",
    complexityBase: 7,
    defaultVolume: 30,
    questions: [
      { key: 'clientName', label: 'Nom du client',                          labelEn: "Client's business name",         type: 'text',   placeholder: 'Ex: Garage Martin' },
      { key: 'industry',   label: 'Dans quelle industrie est ton client ?', labelEn: "What's your client's industry?", type: 'select', options: ['Garage','Clinique','Salon','Resto','Services pro','Autre'] },
      { key: 'tools',      label: 'Ton client utilise quels outils ?',      labelEn: 'What tools does your client use?', type: 'multi',  options: ['Twilio','Aircall','Google Voice','Slack','Gmail','Aucun'] },
      { key: 'volume',     label: "Combien d'appels manqués ton client a par semaine ?", labelEn: 'How many missed calls does your client get per week?', type: 'number', placeholder: '30' },
      { key: 'budget',     label: 'Quel est le budget mensuel de ton client ?', labelEn: "What's your client's monthly budget?", type: 'select', options: ['< 500$','500-1000$','1000-2000$','2000+$'] },
    ],
    makeJsonSkeleton: {
      name: 'NT Solutions — {{CLIENT_NAME}} — Répondeur intelligent',
      flow: [
        { id: 1, module: 'twilio:watchVoicemail',     version: 1, parameters: { phoneNumber: '{{TWILIO_PHONE}}' }, metadata: { designer: { x: 0, y: 0 } } },
        { id: 2, module: 'openai-whisper:Transcribe', version: 1, parameters: { model: 'whisper-1', language: 'fr', audio: '{{ `{{1.recordingUrl}}` }}' }, metadata: { designer: { x: 300, y: 0 } } },
        { id: 3, module: 'anthropic-claude:CreateAMessage', version: 1, parameters: { model: 'claude-sonnet-4-5', max_tokens: 500, system: '{{SYSTEM_PROMPT}}', messages: [{ role:'user', content:'Message vocal transcrit : {{ `{{2.text}}` }}. Appelant : {{ `{{1.from}}` }}' }] }, metadata: { designer: { x: 600, y: 0 } } },
        { id: 4, module: 'twilio:SendSMS',            version: 1, parameters: { to: '{{ `{{1.from}}` }}', from: '{{TWILIO_PHONE}}', body: '{{SMS_CALLBACK_TEMPLATE}}' }, metadata: { designer: { x: 900, y: 0 } } },
        { id: 5, module: 'gmail:SendEmail',           version: 2, parameters: { to: ['{{NOTIFY_EMAIL}}'], subject: 'Appel manqué {{CLIENT_NAME}} — {{ `{{1.from}}` }}', contentType: 'text', content: 'Transcription :\n{{ `{{2.text}}` }}\n\nAnalyse Claude :\n{{ `{{3.content[].text}}` }}' }, metadata: { designer: { x: 1200, y: 0 } } },
      ],
      metadata: { instant: true, version: 1, scenario: { roundtrips: 1, maxErrors: 3, autoCommit: true, sequential: true, confidential: true, dataloss: false }, designer: { orphans: [] } },
    },
  },
];

export function getTemplate(id) {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id) || null;
}
