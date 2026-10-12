// Video languages: everything the script writer, captions, voice and post kit need per language.
// English is the reference pack; the others follow the same shape. Interface translations live in
// i18n.js — these packs are about the *content* of a video.

export const VIDEO_LANGS = ['en', 'es', 'fr', 'de', 'pt', 'hi', 'ar'];

export const LANG_META = {
  en: { id: 'en', name: 'English', native: 'English', dir: 'ltr', wiki: 'en', espeak: 'en-us', wps: 2.6, locale: 'en' },
  es: { id: 'es', name: 'Spanish', native: 'Español', dir: 'ltr', wiki: 'es', espeak: 'es', wps: 2.9, locale: 'es' },
  fr: { id: 'fr', name: 'French', native: 'Français', dir: 'ltr', wiki: 'fr', espeak: 'fr', wps: 2.8, locale: 'fr' },
  de: { id: 'de', name: 'German', native: 'Deutsch', dir: 'ltr', wiki: 'de', espeak: 'de', wps: 2.3, locale: 'de' },
  pt: { id: 'pt', name: 'Portuguese', native: 'Português', dir: 'ltr', wiki: 'pt', espeak: 'pt-br', wps: 2.7, locale: 'pt-BR' },
  hi: { id: 'hi', name: 'Hindi', native: 'हिन्दी', dir: 'ltr', wiki: 'hi', espeak: 'hi', wps: 2.5, locale: 'hi' },
  ar: { id: 'ar', name: 'Arabic', native: 'العربية', dir: 'rtl', wiki: 'ar', espeak: 'ar', wps: 2.0, locale: 'ar' },
};

export const normLang = (id) => (LANG_META[id] ? id : 'en');
export const langMeta = (id) => LANG_META[normLang(id)];

/** Best guess of the language a text is written in (script first, then common words). */
export function detectLang(text) {
  const t = String(text || '').slice(0, 4000);
  const ar = (t.match(/[؀-ۿ]/g) || []).length;
  const hi = (t.match(/[ऀ-ॿ]/g) || []).length;
  const latin = (t.match(/[A-Za-zÀ-ɏ]/g) || []).length;
  if (ar > latin && ar >= hi) return 'ar';
  if (hi > latin) return 'hi';
  if (!latin) return null;
  const words = t.toLowerCase().match(/[a-zà-öø-ÿœß]+/g) || [];
  const score = {};
  for (const id of ['en', 'es', 'fr', 'de', 'pt']) {
    const marks = PACKS[id].marker;
    score[id] = words.reduce((n, w) => n + (marks.has(w) ? 1 : 0), 0);
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 2 ? best[0] : null;
}

// ---------------------------------------------------------------- helpers shared by the packs

const set = (s) => new Set(s.trim().split(/\s+/));
export const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
const lcFirst = (s) => (s ? s.charAt(0).toLocaleLowerCase() + s.slice(1) : s);

// French "que" + vowel → "qu'"
function frQue(s) {
  return /^[aeiouyàâäéèêëîïôöùûüœh]/i.test(s) && !/^h[aeiouy]/i.test(s) ? `qu'${s}` : `que ${s}`;
}

// ---------------------------------------------------------------- packs

const PACKS = {
  en: {
    minWord: 3,
    qmark: '?',
    stop: null, // the English writer keeps its own lists in script.js
    marker: set('the and of to is are was were that this with for from have has what why how you your it its they their which'),
    hooks: {
      facts: ['Here are facts about {topic} that sound fake but are true.', "Most people know nothing about {topic}. Here's what you're missing.", 'Stop scrolling. These facts about {topic} are wild.'],
      list: ["{n} things about {topic} you probably didn't know.", 'Here are {n} facts about {topic} worth knowing.', '{n} things about {topic} that will surprise you.'],
      explainer: ['{Topic}, explained in under a minute.', '{Topic}, explained simply.', 'Let me explain {topic} in plain words.'],
      story: ['This is the story of {topic}.', 'Let me tell you the story of {topic}.', 'The story of {topic} is stranger than you think.'],
      mystery: ['Here is something about {topic} that most people never question.', "There's more to {topic} than you think.", "Something about {topic} doesn't add up."],
      motivation: ['If you need a push today, listen to this.', 'Here is a lesson about {topic} worth remembering.', 'Read this when you feel stuck.'],
    },
    ctas: {
      facts: ['Follow for more facts like this.', 'Which fact surprised you most? Tell me in the comments.', 'Save this and share it with someone curious.'],
      list: ['Which one did you already know? Comment below.', 'Follow for more lists like this.', 'Save this list for later.'],
      explainer: ['Now you know. Follow for more quick explainers.', 'Save this so you remember it later.', 'Follow for more things explained simply.'],
      story: ['Follow for more stories like this one.', 'What would you have done? Tell me below.', 'Share this with someone who loves a good story.'],
      mystery: ['What do you think is going on? Comment your theory.', 'Follow for more mysteries like this.', 'Share this with someone who loves a mystery.'],
      motivation: ['Save this for the day you need it.', 'Send this to someone who needs it today.', 'Follow for a daily push forward.'],
    },
    ordinals: ['Number one.', 'Number two.', 'Number three.', 'Number four.', 'Number five.', 'Number six.', 'Number seven.', 'Number eight.', 'Number nine.', 'Number ten.'],
    next: 'Next.',
    ordinalRe: /^(number (one|two|three|four|five|six|seven|eight|nine|ten)|next)\.\s*/i,
    ctaEmoji: [
      [/\bcomment|tell me|below\b/i, '💬'],
      [/\bsave\b/i, '📌'],
      [/\bshare|send\b/i, '📤'],
      [/\bfollow\b/i, '🔔'],
    ],
    ask: ['Which part surprised you?', 'Did you know this?', 'Follow for more.', 'Save this for later.'],
    tags: {
      facts: ['didyouknow', 'facts', 'funfacts', 'learnontiktok'],
      list: ['top5', 'facts', 'didyouknow', 'learnsomethingnew'],
      explainer: ['explained', 'learnontiktok', 'science', 'education'],
      story: ['storytime', 'history', 'truestory'],
      mystery: ['mystery', 'unsolved', 'creepy', 'didyouknow'],
      motivation: ['motivation', 'mindset', 'selfimprovement', 'discipline'],
    },
    untitled: 'Untitled video',
    outline: (t, q, cta) => [q || `Here is what you need to know about ${t}.`, `Write your first point about ${t} here.`, 'Add a second point, ideally with a surprising number.', 'Add one more point that people rarely hear.', cta],
    yourTopic: 'your topic',
    newLine: 'New line — click to edit.',
    madeWith: 'Made with AutoShorts',
    ideas: ['Why do octopuses have three hearts?', 'Why is the ocean salty?', 'How does caffeine work?', 'The history of coffee', 'How do bees make honey?', 'Why do we dream?', 'What is a black hole?', 'How compound interest works', 'Why is the sky blue?', 'How honeybees make honey', 'How the pyramids were built'],
    hookPlaceholder: 'Your topic becomes the hook',
    credits: { facts: (t) => `Facts: Wikipedia, “${t}” (CC BY-SA 4.0)`, stock: (n) => `Stock footage: ${n} on Pexels` },
    wikiEnd: 'See also|References|External links|Further reading|Notes|Bibliography|Sources',
  },

  es: {
    minWord: 3,
    qmark: '?',
    openQ: '¿',
    marker: set('el la los las de del que y en un una por con para es son está como pero más sus qué cómo porque también'),
    stop: set(`de la que el en y a los se del las un por con no una su para es al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te ti tu tus ellas os esos esas estoy estás está estamos están esté estaba estaban estado sabías sabes cerca casi alrededor aproximadamente unos unas fue fueron era eran ser son sido siendo soy eres somos sea sean será serán sería tiene tienen tener tengo tenía tenían tuvo había hace hacen hacer puede pueden poder debe deben cada así aunque luego además según tan solo sólo cómo dónde cuándo cuál cuáles quién quiénes cuánto vez veces año años día días cosa cosas forma parte se sus lo las`),
    weak: set('millones millón mil billones grande pequeño pequeña bueno buena malo mala mejor peor nuevo nueva viejo vieja gran mayor menor primero primera segundo tercero último cierto real muy mucho mucha muchos muchas número uno una dos tres cuatro cinco seis siete ocho nueve diez cosa cosas gente forma vez veces año años día días tiempo'),
    pronounStart: /^(esto|esta|este|estos|estas|eso|esa|ese|esos|esas|ello|ella|él|ellos|ellas|su|sus|dicho|dicha)(?![\p{L}])/iu,
    factCues: /(?<![\p{L}])(más grande|el más|la más|mayor|menor|primer|primera|único|única|nunca|siempre|récord|científicos|investigadores|estudio|descubr\p{L}*|millones|miles|por ciento|secreto|raro|mortal)(?![\p{L}])/iu,
    leadConnectors: /^(sin embargo|además|por otro lado|por ejemplo|de hecho|asimismo|por lo tanto|también|en cambio|así),\s+/i,
    questionStart: /^¿?\s*(por qué|porqué|cómo|qué|cuál|cuáles|dónde|cuándo|quién|quiénes|cuánto|cuántos|cuántas|es|son|existe|puede|pueden)(?![\p{L}])/iu,
    didYouKnow: (s, keepCase) => `¿Sabías que ${keepCase ? s : lcFirst(s)}?`,
    hooks: {
      facts: ['{Topic}: datos que parecen falsos, pero son ciertos.', '{Topic}: casi nadie sabe esto.', 'Deja de deslizar. {Topic} es más increíble de lo que crees.'],
      list: ['{Topic}: {n} cosas que probablemente no sabías.', '{Topic}: {n} datos que vale la pena conocer.', '{Topic}: {n} cosas que te van a sorprender.'],
      explainer: ['{Topic}, explicado en menos de un minuto.', '{Topic}, explicado de forma sencilla.', '{Topic}: te lo explico con palabras simples.'],
      story: ['{Topic}: una historia más extraña de lo que crees.', '{Topic}: esta es la historia completa.', '{Topic}: déjame contarte la historia.'],
      mystery: ['{Topic}: algo que casi nadie se pregunta.', '{Topic}: hay más de lo que crees.', '{Topic}: algo aquí no cuadra.'],
      motivation: ['Si hoy necesitas un empujón, escucha esto.', '{Topic}: una lección que vale la pena recordar.', 'Lee esto cuando te sientas estancado.'],
    },
    ctas: {
      facts: ['Sígueme para más datos como este.', '¿Qué dato te sorprendió más? Cuéntamelo en los comentarios.', 'Guárdalo y compártelo con alguien curioso.'],
      list: ['¿Cuál ya sabías? Comenta abajo.', 'Sígueme para más listas como esta.', 'Guarda esta lista para después.'],
      explainer: ['Ahora ya lo sabes. Sígueme para más explicaciones rápidas.', 'Guárdalo para recordarlo después.', 'Sígueme para más cosas explicadas fácil.'],
      story: ['Sígueme para más historias como esta.', '¿Qué habrías hecho tú? Cuéntamelo abajo.', 'Compártelo con alguien a quien le encanten las buenas historias.'],
      mystery: ['¿Qué crees que está pasando? Comenta tu teoría.', 'Sígueme para más misterios como este.', 'Compártelo con alguien a quien le encanten los misterios.'],
      motivation: ['Guárdalo para el día que lo necesites.', 'Envíaselo a alguien que lo necesite hoy.', 'Sígueme para un empujón diario.'],
    },
    ordinals: ['Número uno.', 'Número dos.', 'Número tres.', 'Número cuatro.', 'Número cinco.', 'Número seis.', 'Número siete.', 'Número ocho.', 'Número nueve.', 'Número diez.'],
    next: 'Siguiente.',
    ordinalRe: /^(número (uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)|siguiente)\.\s*/i,
    numWords: { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100, mil: 1000 },
    percent: 'por ciento',
    scale: [['mil millones', 1e9], ['millones', 1e6], ['millón', 1e6]],
    ctaEmoji: [
      [/coment|cuéntame|abajo/i, '💬'],
      [/guárd|guarda/i, '📌'],
      [/compárt|envía/i, '📤'],
      [/sígueme|sigue/i, '🔔'],
    ],
    ask: ['¿Qué parte te sorprendió?', '¿Lo sabías?', 'Sígueme para más.', 'Guárdalo para después.'],
    tags: {
      facts: ['sabiasque', 'datoscuriosos', 'curiosidades'],
      list: ['top5', 'datoscuriosos', 'sabiasque'],
      explainer: ['explicado', 'aprendeentiktok', 'ciencia'],
      story: ['historia', 'historiasreales', 'storytime'],
      mystery: ['misterio', 'misterios', 'sinresolver'],
      motivation: ['motivacion', 'mentalidad', 'superacion'],
    },
    power: set('nunca siempre secreto gratis mejor peor único única primero último millones mortal peligroso increíble imposible nadie todos verdad'),
    untitled: 'Video sin título',
    outline: (t, q, cta) => [q || `Esto es lo que necesitas saber sobre ${t}.`, 'Escribe aquí tu primer punto.', 'Agrega un segundo punto, mejor si tiene un número sorprendente.', 'Agrega un punto más que poca gente conoce.', cta],
    yourTopic: 'tu tema',
    newLine: 'Nueva línea: haz clic para editarla.',
    madeWith: 'Hecho con AutoShorts',
    ideas: ['¿Por qué el pulpo tiene tres corazones?', '¿Por qué el mar es salado?', '¿Cómo funciona la cafeína?', 'La historia del café', '¿Cómo hacen miel las abejas?', '¿Por qué soñamos?'],
    hookPlaceholder: 'Tu tema se convierte en el gancho',
    credits: { facts: (t) => `Datos: Wikipedia, «${t}» (CC BY-SA 4.0)`, stock: (n) => `Videos de stock: ${n} en Pexels` },
    wikiEnd: 'Véase también|Referencias|Enlaces externos|Bibliografía|Notas|Fuentes',
  },

  fr: {
    minWord: 3,
    qmark: '?',
    marker: set('le la les de des du un une et est sont dans pour sur avec que qui pas plus mais ce cette nous vous il elle'),
    stop: set(`le la les de des du un une et à au aux en dans par pour sur avec sans sous ce cet cette ces se sa son ses leur leurs qui que quoi dont où ne pas plus moins très tout tous toute toutes il elle ils elles on nous vous je tu me te lui y est sont été être était étaient sera seront a ont avait avaient avoir fait faire peut peuvent comme mais ou donc or ni car si aussi alors ainsi entre vers chez depuis pendant avant après encore déjà même autre autres quel quelle quels quelles chaque lorsque quand comment pourquoi notamment selon cela ça celui celle ceux celles ici là mon ma mes ton ta tes notre nos votre vos fois an ans année années jour jours chose choses façon partie environ presque près savais savez c'est qu'il qu'elle d'un d'une l'un`),
    weak: set('millions million milliards milliard mille grand grande grands petit petite petits bon bonne mauvais meilleur meilleure pire nouveau nouvelle vieux vieille premier première deuxième dernier dernière vrai réel très beaucoup nombre un une deux trois quatre cinq six sept huit neuf dix chose choses gens façon fois an ans année jour jours temps'),
    pronounStart: /^(il|elle|ils|elles|ce|cet|cette|ces|cela|ceci|ça|leur|leurs|son|sa|ses|celui|celle|ceux)(?![\p{L}])/iu,
    factCues: /(?<![\p{L}])(plus grand\p{L}*|le plus|la plus|premier|première|seul|seule|jamais|toujours|record|scientifiques|chercheurs|étude|découvert\p{L}*|millions|milliers|pour cent|secret|rare|mortel\p{L}*)(?![\p{L}])/iu,
    leadConnectors: /^(cependant|de plus|par ailleurs|par exemple|en fait|ainsi|donc|toutefois|en revanche|aussi),\s+/i,
    questionStart: /^(pourquoi|comment|que|qu'|quoi|quel|quelle|quels|quelles|où|quand|qui|combien|est-ce)/i,
    didYouKnow: (s, keepCase) => `Tu savais ${frQue(keepCase ? s : lcFirst(s))}?`,
    hooks: {
      facts: ['{Topic}: des faits qui ont l\'air faux, mais qui sont vrais.', '{Topic}: presque personne ne sait ça.', 'Arrête de scroller. {Topic}, c\'est fascinant.'],
      list: ['{Topic}: {n} choses que tu ne savais probablement pas.', '{Topic}: {n} faits à connaître.', '{Topic}: {n} choses qui vont te surprendre.'],
      explainer: ['{Topic}, expliqué en moins d\'une minute.', '{Topic}, expliqué simplement.', '{Topic}: je t\'explique avec des mots simples.'],
      story: ['{Topic}: une histoire plus étrange que tu ne le crois.', '{Topic}: voici toute l\'histoire.', '{Topic}: laisse-moi te raconter.'],
      mystery: ['{Topic}: un détail que presque personne ne remarque.', '{Topic}: il y a plus que ce que tu crois.', '{Topic}: quelque chose ne colle pas.'],
      motivation: ['Si tu as besoin d\'un coup de pouce aujourd\'hui, écoute ça.', '{Topic}: une leçon à retenir.', 'Lis ceci quand tu te sens bloqué.'],
    },
    ctas: {
      facts: ['Abonne-toi pour plus de faits comme celui-ci.', 'Quel fait t\'a le plus surpris? Dis-le en commentaire.', 'Enregistre et partage avec quelqu\'un de curieux.'],
      list: ['Lequel tu connaissais déjà? Dis-le en commentaire.', 'Abonne-toi pour d\'autres listes comme celle-ci.', 'Enregistre cette liste pour plus tard.'],
      explainer: ['Maintenant tu sais. Abonne-toi pour d\'autres explications rapides.', 'Enregistre-le pour t\'en souvenir.', 'Abonne-toi pour plus de choses expliquées simplement.'],
      story: ['Abonne-toi pour d\'autres histoires comme celle-ci.', 'Et toi, qu\'aurais-tu fait? Dis-le en commentaire.', 'Partage avec quelqu\'un qui adore les bonnes histoires.'],
      mystery: ['Selon toi, que se passe-t-il? Donne ta théorie en commentaire.', 'Abonne-toi pour d\'autres mystères.', 'Partage avec quelqu\'un qui adore les mystères.'],
      motivation: ['Enregistre-le pour le jour où tu en auras besoin.', 'Envoie-le à quelqu\'un qui en a besoin aujourd\'hui.', 'Abonne-toi pour ta dose de motivation quotidienne.'],
    },
    ordinals: ['Numéro un.', 'Numéro deux.', 'Numéro trois.', 'Numéro quatre.', 'Numéro cinq.', 'Numéro six.', 'Numéro sept.', 'Numéro huit.', 'Numéro neuf.', 'Numéro dix.'],
    next: 'Ensuite.',
    ordinalRe: /^(numéro (un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)|ensuite)\.\s*/i,
    numWords: { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20, trente: 30, quarante: 40, cinquante: 50, cent: 100, mille: 1000 },
    percent: 'pour cent',
    scale: [['milliards', 1e9], ['milliard', 1e9], ['millions', 1e6], ['million', 1e6]],
    ctaEmoji: [
      [/comment|dis-le/i, '💬'],
      [/enregistr/i, '📌'],
      [/partage|envoie/i, '📤'],
      [/abonne/i, '🔔'],
    ],
    ask: ['Quelle partie t\'a surpris?', 'Tu le savais?', 'Abonne-toi pour plus.', 'Enregistre pour plus tard.'],
    tags: {
      facts: ['lesaviezvous', 'anecdote', 'culturegenerale'],
      list: ['top5', 'anecdote', 'lesaviezvous'],
      explainer: ['explication', 'apprendresurtiktok', 'science'],
      story: ['histoire', 'histoirevraie', 'storytime'],
      mystery: ['mystere', 'enigme', 'inexplique'],
      motivation: ['motivation', 'mindset', 'developpementpersonnel'],
    },
    power: set('jamais toujours secret gratuit meilleur pire seul premier dernier millions mortel dangereux incroyable impossible personne tous vérité'),
    untitled: 'Vidéo sans titre',
    outline: (t, q, cta) => [q || `Voici ce qu'il faut savoir sur ${t}.`, 'Écris ici ton premier point.', 'Ajoute un deuxième point, idéalement avec un chiffre surprenant.', 'Ajoute encore un point que peu de gens connaissent.', cta],
    yourTopic: 'ton sujet',
    newLine: 'Nouvelle ligne : clique pour la modifier.',
    madeWith: 'Créé avec AutoShorts',
    ideas: ['Pourquoi la pieuvre a-t-elle trois cœurs\u202F?', 'Pourquoi la mer est-elle salée\u202F?', 'Comment agit la caféine\u202F?', 'L’histoire du café', 'Comment les abeilles font-elles le miel\u202F?', 'Pourquoi rêvons-nous\u202F?'],
    hookPlaceholder: 'Ton sujet devient l’accroche',
    credits: { facts: (t) => `Sources : Wikipédia, « ${t} » (CC BY-SA 4.0)`, stock: (n) => `Vidéos d’illustration : ${n} sur Pexels` },
    wikiEnd: 'Voir aussi|Notes et références|Références|Liens externes|Bibliographie|Articles connexes|Annexes',
  },

  de: {
    minWord: 3,
    qmark: '?',
    marker: set('der die das und ist sind nicht mit von zu den dem ein eine für auf auch dass wie was warum sich ich du wir'),
    stop: set(`der die das den dem des ein eine einen einem einer eines und oder aber auch als am an auf aus bei bis da damit dann dass daß du er es sie wir ihr ich ist sind war waren wird werden wurde wurden sein seine seinen seinem seiner ihre ihren ihrem ihrer im in ins mit nach nicht noch nur ob ohne so um unter über vom von vor wie wo zu zum zur sich man mehr sehr schon kann können muss müssen hat haben hatte hatten gibt etwa durch gegen während weil wenn was wer welche welcher welches dieser diese dieses diesem diesen jeder jede jedes alle allen viele vielen einige andere anderen etwas ganz immer wieder dort hier heute jahr jahre jahren tag tage mal zeit art teil denn doch eben selbst sowie bzw etwa fast rund ungefähr knapp meisten meiste beiden gewusst wusstest`),
    weak: set('millionen million milliarden milliarde tausend groß große großen großer klein kleine kleinen gut gute guten schlecht besser beste besten neu neue neuen alt alte alten erste ersten zweite letzte letzten echt wirklich sehr viel viele vielen nummer eins zwei drei vier fünf sechs sieben acht neun zehn ding dinge leute art mal jahr jahre jahren tag tage zeit'),
    pronounStart: /^(er|sie|es|dies|diese|dieser|dieses|diesen|ihr|ihre|sein|seine|seinen|dort|dabei|damit|deshalb)(?![\p{L}])/iu,
    factCues: /(?<![\p{L}])(größte\p{L}*|kleinste\p{L}*|schnellste\p{L}*|erste\p{L}*|einzige\p{L}*|nie|niemals|immer|rekord|wissenschaftler|forscher|studie|entdeckt\p{L}*|millionen|tausende|prozent|geheim\p{L}*|selten\p{L}*|tödlich\p{L}*)(?![\p{L}])/iu,
    leadConnectors: /^(außerdem|jedoch|allerdings|zum beispiel|tatsächlich|daher|deshalb|zudem|dennoch),\s+/i,
    questionStart: /^(warum|wieso|weshalb|wie|was|wo|wann|wer|welche|welcher|welches|ist|sind|kann|können|gibt)(?![\p{L}])/iu,
    didYouKnow: (s) => `Schon gewusst? ${s}`,
    hooks: {
      facts: ['{Topic}: Fakten, die falsch klingen, aber wahr sind.', '{Topic}: Das wissen die wenigsten.', 'Hör auf zu scrollen. {Topic} ist verrückter, als du denkst.'],
      list: ['{Topic}: {n} Dinge, die du wahrscheinlich nicht wusstest.', '{Topic}: {n} Fakten, die du kennen solltest.', '{Topic}: {n} Dinge, die dich überraschen werden.'],
      explainer: ['{Topic}, in unter einer Minute erklärt.', '{Topic}, einfach erklärt.', '{Topic}: Ich erkläre es dir ganz einfach.'],
      story: ['{Topic}: Die Geschichte ist seltsamer, als du denkst.', '{Topic}: Das ist die ganze Geschichte.', '{Topic}: Lass mich dir die Geschichte erzählen.'],
      mystery: ['{Topic}: Etwas, das kaum jemand hinterfragt.', '{Topic}: Da steckt mehr dahinter, als du denkst.', '{Topic}: Irgendetwas passt hier nicht zusammen.'],
      motivation: ['Wenn du heute einen Schubs brauchst, hör dir das an.', '{Topic}: Eine Lektion, die du dir merken solltest.', 'Lies das, wenn du nicht weiterkommst.'],
    },
    ctas: {
      facts: ['Folge mir für mehr Fakten wie diesen.', 'Welcher Fakt hat dich am meisten überrascht? Schreib es in die Kommentare.', 'Speicher das und teile es mit jemandem, der neugierig ist.'],
      list: ['Welchen kanntest du schon? Schreib es unten.', 'Folge mir für mehr Listen wie diese.', 'Speicher dir diese Liste für später.'],
      explainer: ['Jetzt weißt du es. Folge mir für mehr schnelle Erklärungen.', 'Speicher das, damit du es dir merkst.', 'Folge mir für mehr einfach erklärte Dinge.'],
      story: ['Folge mir für mehr Geschichten wie diese.', 'Was hättest du getan? Schreib es unten.', 'Teile das mit jemandem, der gute Geschichten liebt.'],
      mystery: ['Was steckt deiner Meinung nach dahinter? Schreib deine Theorie in die Kommentare.', 'Folge mir für mehr Rätsel wie dieses.', 'Teile das mit jemandem, der Rätsel liebt.'],
      motivation: ['Speicher das für den Tag, an dem du es brauchst.', 'Schick das jemandem, der es heute braucht.', 'Folge mir für deinen täglichen Motivationsschub.'],
    },
    ordinals: ['Nummer eins.', 'Nummer zwei.', 'Nummer drei.', 'Nummer vier.', 'Nummer fünf.', 'Nummer sechs.', 'Nummer sieben.', 'Nummer acht.', 'Nummer neun.', 'Nummer zehn.'],
    next: 'Als Nächstes.',
    ordinalRe: /^(nummer (eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)|als nächstes)\.\s*/i,
    numWords: { zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, fünfzehn: 15, zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, hundert: 100, tausend: 1000 },
    percent: 'Prozent',
    scale: [['Milliarden', 1e9], ['Milliarde', 1e9], ['Millionen', 1e6], ['Million', 1e6]],
    keepCase: true, // nouns are capitalised in German
    ctaEmoji: [
      [/kommentar|schreib/i, '💬'],
      [/speicher/i, '📌'],
      [/teile|schick/i, '📤'],
      [/folge/i, '🔔'],
    ],
    ask: ['Was hat dich überrascht?', 'Wusstest du das?', 'Folge mir für mehr.', 'Speicher das für später.'],
    tags: {
      facts: ['wusstestdu', 'fakten', 'funfacts'],
      list: ['top5', 'fakten', 'wusstestdu'],
      explainer: ['einfacherklärt', 'lernenmittiktok', 'wissenschaft'],
      story: ['geschichte', 'wahregeschichte', 'storytime'],
      mystery: ['mysterium', 'rätsel', 'ungeklärt'],
      motivation: ['motivation', 'mindset', 'selbstverbesserung'],
    },
    power: set('nie niemals immer geheim gratis beste schlimmste einzige erste letzte millionen tödlich gefährlich unglaublich unmöglich niemand alle wahrheit'),
    untitled: 'Unbenanntes Video',
    outline: (t, q, cta) => [q || `Das musst du über ${t} wissen.`, 'Schreib hier deinen ersten Punkt.', 'Füge einen zweiten Punkt hinzu, am besten mit einer überraschenden Zahl.', 'Füge noch einen Punkt hinzu, den kaum jemand kennt.', cta],
    yourTopic: 'dein Thema',
    newLine: 'Neue Zeile – zum Bearbeiten anklicken.',
    madeWith: 'Erstellt mit AutoShorts',
    ideas: ['Warum hat ein Oktopus drei Herzen?', 'Warum ist das Meer salzig?', 'Wie wirkt Koffein?', 'Die Geschichte des Kaffees', 'Wie machen Bienen Honig?', 'Warum träumen wir?'],
    hookPlaceholder: 'Dein Thema wird zum Einstieg',
    credits: { facts: (t) => `Fakten: Wikipedia, „${t}“ (CC BY-SA 4.0)`, stock: (n) => `Stockvideos: ${n} auf Pexels` },
    wikiEnd: 'Siehe auch|Literatur|Weblinks|Einzelnachweise|Anmerkungen|Quellen',
  },

  pt: {
    minWord: 3,
    qmark: '?',
    marker: set('o a os as de do da dos das que e em um uma para com não por mais como mas você é são está isso também'),
    stop: set(`de a o que e do da em um para é com não uma os no se na por mais as dos como mas foi ao ele das tem à seu sua ou ser quando muito há nos já está eu também só pelo pela até isso ela entre era depois sem mesmo aos ter seus quem nas me esse eles estão você tinha foram essa num nem suas meu às minha têm numa pelos elas havia seja qual será nós tenho lhe deles essas esses pelas este fosse dele tu te vocês lhes meus minhas teu tua nosso nossa nossos nossas dela delas esta estes estas aquele aquela aqueles aquelas isto aquilo cerca quase aproximadamente sabia sabe estou estamos são sou somos eram sido sendo pode podem cada assim porque porém além segundo tão apenas onde quais quanto vez vezes ano anos dia dias coisa coisas forma parte`),
    weak: set('milhões milhão bilhões bilhão mil grande grandes pequeno pequena bom boa mau má melhor pior novo nova velho velha primeiro primeira segundo terceiro último real muito muita muitos muitas número um uma dois duas três quatro cinco seis sete oito nove dez coisa coisas gente forma vez vezes ano anos dia dias tempo'),
    pronounStart: /^(ele|ela|eles|elas|isso|isto|este|esta|estes|estas|esse|essa|seu|sua|seus|suas|dele|dela)(?![\p{L}])/iu,
    factCues: /(?<![\p{L}])(maior|o mais|a mais|menor|primeiro|primeira|único|única|nunca|sempre|recorde|cientistas|pesquisadores|estudo|descobr\p{L}*|milhões|milhares|por cento|segredo|raro|mortal)(?![\p{L}])/iu,
    leadConnectors: /^(no entanto|além disso|por outro lado|por exemplo|de fato|assim|portanto|também|contudo|entretanto),\s+/i,
    questionStart: /^(por que|porque|por quê|como|o que|qual|quais|onde|quando|quem|quanto|quantos|quantas|é|são|existe|pode|podem)(?![\p{L}])/iu,
    didYouKnow: (s, keepCase) => `Você sabia que ${keepCase ? s : lcFirst(s)}?`,
    hooks: {
      facts: ['{Topic}: fatos que parecem mentira, mas são verdade.', '{Topic}: quase ninguém sabe disso.', 'Para de rolar a tela. {Topic} é mais incrível do que você imagina.'],
      list: ['{Topic}: {n} coisas que você provavelmente não sabia.', '{Topic}: {n} fatos que valem a pena conhecer.', '{Topic}: {n} coisas que vão te surpreender.'],
      explainer: ['{Topic}, explicado em menos de um minuto.', '{Topic}, explicado de um jeito simples.', '{Topic}: vou te explicar com palavras simples.'],
      story: ['{Topic}: uma história mais estranha do que você imagina.', '{Topic}: essa é a história completa.', '{Topic}: deixa eu te contar essa história.'],
      mystery: ['{Topic}: algo que quase ninguém questiona.', '{Topic}: tem mais coisa aí do que você imagina.', '{Topic}: alguma coisa aqui não se encaixa.'],
      motivation: ['Se você precisa de um empurrão hoje, escuta isso.', '{Topic}: uma lição que vale lembrar.', 'Leia isso quando se sentir travado.'],
    },
    ctas: {
      facts: ['Me segue para mais fatos como esse.', 'Qual fato te surpreendeu mais? Conta nos comentários.', 'Salva e compartilha com alguém curioso.'],
      list: ['Qual você já sabia? Comenta aqui embaixo.', 'Me segue para mais listas como essa.', 'Salva essa lista para depois.'],
      explainer: ['Agora você sabe. Me segue para mais explicações rápidas.', 'Salva para lembrar depois.', 'Me segue para mais coisas explicadas de um jeito simples.'],
      story: ['Me segue para mais histórias como essa.', 'O que você teria feito? Conta aqui embaixo.', 'Compartilha com alguém que ama uma boa história.'],
      mystery: ['O que você acha que está acontecendo? Comenta sua teoria.', 'Me segue para mais mistérios como esse.', 'Compartilha com alguém que ama um mistério.'],
      motivation: ['Salva para o dia em que você precisar.', 'Manda para alguém que precisa ouvir isso hoje.', 'Me segue para um empurrão diário.'],
    },
    ordinals: ['Número um.', 'Número dois.', 'Número três.', 'Número quatro.', 'Número cinco.', 'Número seis.', 'Número sete.', 'Número oito.', 'Número nove.', 'Número dez.'],
    next: 'Próximo.',
    ordinalRe: /^(número (um|dois|três|quatro|cinco|seis|sete|oito|nove|dez)|próximo)\.\s*/i,
    numWords: { dois: 2, duas: 2, três: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cem: 100, mil: 1000 },
    percent: 'por cento',
    scale: [['bilhões', 1e9], ['bilhão', 1e9], ['milhões', 1e6], ['milhão', 1e6]],
    ctaEmoji: [
      [/coment|conta/i, '💬'],
      [/salva/i, '📌'],
      [/compartilh|manda/i, '📤'],
      [/segue/i, '🔔'],
    ],
    ask: ['Qual parte te surpreendeu?', 'Você sabia disso?', 'Me segue para mais.', 'Salva para depois.'],
    tags: {
      facts: ['vocesabia', 'curiosidades', 'fatos'],
      list: ['top5', 'curiosidades', 'vocesabia'],
      explainer: ['explicado', 'aprendanotiktok', 'ciencia'],
      story: ['historia', 'historiareal', 'storytime'],
      mystery: ['misterio', 'misterios', 'semsolucao'],
      motivation: ['motivacao', 'mentalidade', 'autoconhecimento'],
    },
    power: set('nunca sempre segredo grátis melhor pior único única primeiro último milhões mortal perigoso incrível impossível ninguém todos verdade'),
    untitled: 'Vídeo sem título',
    outline: (t, q, cta) => [q || `Isso é o que você precisa saber sobre ${t}.`, 'Escreva aqui seu primeiro ponto.', 'Adicione um segundo ponto, de preferência com um número surpreendente.', 'Adicione mais um ponto que pouca gente conhece.', cta],
    yourTopic: 'seu tema',
    newLine: 'Nova linha: clique para editar.',
    madeWith: 'Feito com AutoShorts',
    ideas: ['Por que o polvo tem três corações?', 'Por que o mar é salgado?', 'Como a cafeína funciona?', 'A história do café', 'Como as abelhas fazem mel?', 'Por que sonhamos?'],
    hookPlaceholder: 'Seu tema vira o gancho',
    credits: { facts: (t) => `Fatos: Wikipédia, “${t}” (CC BY-SA 4.0)`, stock: (n) => `Vídeos de banco de imagens: ${n} no Pexels` },
    wikiEnd: 'Ver também|Referências|Ligações externas|Bibliografia|Notas|Fontes',
  },

  hi: {
    minWord: 2,
    qmark: '?',
    stop: set(`का के की है हैं को में से पर और या भी तो ही यह वह ये वे इस उस इन उन एक कि जो कर करने करते करता करती किया कई था थी थे होता होती होते हो हुआ हुई हुए गया गई गए रहा रही रहे सकता सकते सकती लिए साथ बाद तक अपने अपना अपनी जब तब कुछ सब बहुत कोई किसी क्या क्यों कैसे कहाँ कब कौन नहीं न हम आप तुम मैं वो इसके उसके इसकी उसकी उनके उनकी इसे उसे जैसे जिससे जिसमें जिसे द्वारा बारे होने वाला वाले वाली साल दिन बार तरह चीज़ ने लगभग करीब क़रीब ज़्यादा अधिक कम जानते जानती रहते रहता रहती जाता जाती जाते बनाता बनाती बनाते देता देती देते लेता लेती लेते`),
    weak: set('करोड़ लाख हज़ार मिलियन बड़ा बड़ी बड़े छोटा छोटी छोटे अच्छा अच्छी बुरा नया नई पुराना पहला पहली दूसरा आखिरी सच बहुत ज़्यादा नंबर एक दो तीन चार पाँच छह सात आठ नौ दस चीज़ लोग तरह बार साल दिन समय'),
    pronounStart: /^(यह|वह|ये|वे|इसका|उसका|इसकी|उसकी|इसके|उसके|इनके|उनके|इसमें|उसमें|इसे|उसे)(?=\s|$)/u,
    factCues: /(सबसे|पहला|पहली|एकमात्र|कभी नहीं|हमेशा|रिकॉर्ड|वैज्ञानिक|शोधकर्ता|अध्ययन|खोज|लाख|करोड़|हज़ार|प्रतिशत|रहस्य|दुर्लभ|घातक)/u,
    leadConnectors: /^(इसके अलावा|हालांकि|उदाहरण के लिए|दरअसल|इसलिए|साथ ही),\s*/u,
    questionStart: /(क्यों|कैसे|क्या|कहाँ|कब|कौन|कितना|कितने|कितनी)/u,
    didYouKnow: (s) => `क्या आप जानते हैं? ${s}`,
    hooks: {
      facts: ['{Topic}: ऐसे तथ्य जो झूठ लगते हैं, लेकिन सच हैं।', '{Topic}: ये बात बहुत कम लोग जानते हैं।', 'स्क्रॉल करना रोकिए। {Topic} जितना आप सोचते हैं, उससे कहीं ज़्यादा दिलचस्प है।'],
      list: ['{Topic}: {n} बातें जो शायद आप नहीं जानते।', '{Topic}: {n} तथ्य जो जानने लायक हैं।', '{Topic}: {n} बातें जो आपको हैरान कर देंगी।'],
      explainer: ['{Topic}, एक मिनट से कम में समझिए।', '{Topic}, आसान भाषा में।', '{Topic}: चलिए आसान शब्दों में समझते हैं।'],
      story: ['{Topic}: ये कहानी जितनी आप सोचते हैं, उससे कहीं ज़्यादा अजीब है।', '{Topic}: ये है पूरी कहानी।', '{Topic}: आइए आपको ये कहानी सुनाते हैं।'],
      mystery: ['{Topic}: एक ऐसी बात जिस पर कोई सवाल नहीं उठाता।', '{Topic}: इसमें जितना दिखता है, उससे कहीं ज़्यादा है।', '{Topic}: कुछ तो है जो मेल नहीं खाता।'],
      motivation: ['अगर आज आपको थोड़ी हिम्मत चाहिए, तो इसे सुनिए।', '{Topic}: एक सबक जो याद रखने लायक है।', 'जब आप अटका हुआ महसूस करें, तब इसे पढ़िए।'],
    },
    ctas: {
      facts: ['ऐसे और तथ्यों के लिए फ़ॉलो करें।', 'आपको कौन सा तथ्य सबसे ज़्यादा चौंकाने वाला लगा? कमेंट में बताइए।', 'इसे सेव करें और किसी जिज्ञासु दोस्त के साथ शेयर करें।'],
      list: ['इनमें से कौन सी बात आप पहले से जानते थे? नीचे कमेंट करें।', 'ऐसी और लिस्ट के लिए फ़ॉलो करें।', 'इस लिस्ट को बाद के लिए सेव कर लें।'],
      explainer: ['अब आप जानते हैं। ऐसी और आसान जानकारी के लिए फ़ॉलो करें।', 'इसे सेव करें ताकि बाद में याद रहे।', 'आसान भाषा में और जानकारी के लिए फ़ॉलो करें।'],
      story: ['ऐसी और कहानियों के लिए फ़ॉलो करें।', 'आप होते तो क्या करते? नीचे बताइए।', 'इसे उस दोस्त के साथ शेयर करें जिसे अच्छी कहानियाँ पसंद हैं।'],
      mystery: ['आपके हिसाब से असल में क्या चल रहा है? अपनी थ्योरी कमेंट करें।', 'ऐसे और रहस्यों के लिए फ़ॉलो करें।', 'इसे उस दोस्त के साथ शेयर करें जिसे रहस्य पसंद हैं।'],
      motivation: ['इसे उस दिन के लिए सेव करें जब आपको इसकी ज़रूरत हो।', 'इसे उस इंसान को भेजें जिसे आज इसकी ज़रूरत है।', 'रोज़ की प्रेरणा के लिए फ़ॉलो करें।'],
    },
    ordinals: ['नंबर एक।', 'नंबर दो।', 'नंबर तीन।', 'नंबर चार।', 'नंबर पाँच।', 'नंबर छह।', 'नंबर सात।', 'नंबर आठ।', 'नंबर नौ।', 'नंबर दस।'],
    next: 'अगला।',
    ordinalRe: /^(नंबर (एक|दो|तीन|चार|पाँच|छह|सात|आठ|नौ|दस)|अगला)।\s*/u,
    numWords: { दो: 2, तीन: 3, चार: 4, पाँच: 5, छह: 6, सात: 7, आठ: 8, नौ: 9, दस: 10, बीस: 20, सौ: 100, हज़ार: 1000 },
    percent: 'प्रतिशत|फ़ीसदी',
    scale: [['करोड़', 1e7], ['लाख', 1e5]],
    ctaEmoji: [
      [/कमेंट|बताइए/u, '💬'],
      [/सेव/u, '📌'],
      [/शेयर|भेजें/u, '📤'],
      [/फ़ॉलो|फॉलो/u, '🔔'],
    ],
    ask: ['आपको कौन सी बात सबसे ज़्यादा हैरान करने वाली लगी?', 'क्या आप ये जानते थे?', 'ऐसी और जानकारी के लिए फ़ॉलो करें।', 'बाद के लिए सेव करें।'],
    tags: {
      facts: ['क्याआपजानतेहैं', 'रोचकतथ्य', 'facts'],
      list: ['top5', 'रोचकतथ्य', 'facts'],
      explainer: ['आसानभाषामें', 'ज्ञान', 'science'],
      story: ['कहानी', 'सच्चीकहानी', 'storytime'],
      mystery: ['रहस्य', 'mystery', 'अनसुलझा'],
      motivation: ['मोटिवेशन', 'प्रेरणा', 'motivation'],
    },
    power: set('कभी हमेशा राज़ रहस्य सबसे पहला आखिरी लाख करोड़ खतरनाक अद्भुत असंभव सच'),
    untitled: 'बिना नाम का वीडियो',
    outline: (t, q, cta) => [q || `${t} के बारे में आपको ये जानना चाहिए।`, 'यहाँ अपनी पहली बात लिखिए।', 'दूसरी बात जोड़िए, हो सके तो किसी चौंकाने वाले नंबर के साथ।', 'एक और बात जोड़िए जो कम लोग जानते हैं।', cta],
    yourTopic: 'आपका विषय',
    newLine: 'नई पंक्ति — बदलने के लिए क्लिक करें।',
    madeWith: 'AutoShorts से बनाया गया',
    ideas: ['ऑक्टोपस के तीन दिल क्यों होते हैं?', 'समुद्र का पानी खारा क्यों होता है?', 'कैफ़ीन कैसे काम करता है?', 'चाय का इतिहास', 'मधुमक्खियाँ शहद कैसे बनाती हैं?', 'हम सपने क्यों देखते हैं?'],
    hookPlaceholder: 'आपका विषय ही वीडियो की शुरुआत बनेगा',
    credits: { facts: (t) => `तथ्य: विकिपीडिया, “${t}” (CC BY-SA 4.0)`, stock: (n) => `स्टॉक वीडियो: ${n}, Pexels पर` },
    wikiEnd: 'इन्हें भी देखें|सन्दर्भ|संदर्भ|बाहरी कड़ियाँ|टिप्पणियाँ|स्रोत',
  },

  ar: {
    minWord: 3,
    qmark: '؟',
    stop: set(`في من على إلى الى عن مع أن إن ان كان كانت يكون تكون هذا هذه ذلك تلك التي الذي الذين هو هي هم هن نحن أنت أنا ما ماذا لماذا كيف متى أين هل لا لم لن قد كل بعض أي أو ثم حتى بين عند عندما بعد قبل منذ خلال حول أكثر أقل جدا جداً فقط أيضا أيضاً كما لكن بل إذا لو غير ضد عبر لدى لها له لهم بها به بهم فيها فيه منها منه عليها عليه إليها إليه وهو وهي وفي ومن وعلى وأن ولا وقد وكان يتم تم سنة عام يوم شيء أشياء التى الى نحو حوالي تقريبا تقريبًا تعلم يزيد تزيد يصل تصل يبلغ تبلغ يوجد توجد يمكن يمتلك تمتلك يملك تملك يعيش تعيش يستطيع تستطيع يعتبر تعتبر أصبح أصبحت يجعل يجعله`),
    weak: set('مليون مليار ألف آلاف ملايين كبير كبيرة صغير صغيرة جيد جيدة سيء أفضل أسوأ جديد جديدة قديم قديمة أول أولى ثاني آخر حقيقي جدا كثير كثيرة رقم واحد اثنان ثلاثة أربعة خمسة ستة سبعة ثمانية تسعة عشرة شيء أشياء الناس طريقة مرة سنة سنوات عام يوم أيام وقت'),
    pronounStart: /^(هذا|هذه|هو|هي|هم|هن|ذلك|تلك|وهو|وهي|لذلك)(?=\s|$)/u,
    factCues: /(أكبر|أصغر|أسرع|أول|الوحيد|الوحيدة|أبدا|دائما|رقم قياسي|العلماء|الباحثون|دراسة|اكتشف|مليون|مليار|آلاف|بالمئة|في المئة|سر|نادر|قاتل)/u,
    leadConnectors: /^(بالإضافة إلى ذلك|علاوة على ذلك|ومع ذلك|على سبيل المثال|في الواقع|لذلك)[،,]\s*/u,
    questionStart: /^(لماذا|كيف|ما|ماذا|أين|متى|من|هل|كم|لم)(?=\s|$)/u,
    didYouKnow: (s) => `هل تعلم؟ ${s}`,
    hooks: {
      facts: ['{Topic}: حقائق تبدو غير معقولة لكنها صحيحة.', '{Topic}: معلومة لا يعرفها كثيرون.', 'توقف عن التمرير. {Topic} أغرب مما تتخيل.'],
      list: ['{Topic}: {n} أشياء ربما لا تعرفها.', '{Topic}: {n} حقائق تستحق المعرفة.', '{Topic}: {n} أشياء ستدهشك.'],
      explainer: ['{Topic} في أقل من دقيقة.', '{Topic} بكل بساطة.', '{Topic}: سأشرحه لك بكلمات بسيطة.'],
      story: ['{Topic}: قصة أغرب مما تظن.', '{Topic}: إليك القصة كاملة.', '{Topic}: دعني أحكي لك القصة.'],
      mystery: ['{Topic}: أمر لا يسأل عنه أحد تقريبًا.', '{Topic}: هناك ما هو أكثر مما تظن.', '{Topic}: هناك شيء لا يبدو منطقيًا.'],
      motivation: ['إن كنت تحتاج دفعة اليوم، فاستمع إلى هذا.', '{Topic}: درس يستحق أن تتذكره.', 'اقرأ هذا عندما تشعر أنك عالق.'],
    },
    ctas: {
      facts: ['تابعني لمزيد من الحقائق مثل هذه.', 'أي معلومة أدهشتك أكثر؟ اكتبها في التعليقات.', 'احفظ الفيديو وشاركه مع شخص فضولي.'],
      list: ['أيها كنت تعرفه من قبل؟ اكتب في التعليقات.', 'تابعني لمزيد من القوائم مثل هذه.', 'احفظ هذه القائمة لوقت لاحق.'],
      explainer: ['الآن عرفت. تابعني لمزيد من الشروحات السريعة.', 'احفظه لتتذكره لاحقًا.', 'تابعني لمزيد من المواضيع المشروحة ببساطة.'],
      story: ['تابعني لمزيد من القصص مثل هذه.', 'ماذا كنت ستفعل؟ أخبرني في التعليقات.', 'شاركه مع شخص يحب القصص الجميلة.'],
      mystery: ['برأيك، ما الذي يحدث؟ اكتب نظريتك في التعليقات.', 'تابعني لمزيد من الألغاز مثل هذا.', 'شاركه مع شخص يحب الألغاز.'],
      motivation: ['احفظه لليوم الذي تحتاجه فيه.', 'أرسله لشخص يحتاجه اليوم.', 'تابعني لجرعة تحفيز يومية.'],
    },
    ordinals: ['أولًا،', 'ثانيًا،', 'ثالثًا،', 'رابعًا،', 'خامسًا،', 'سادسًا،', 'سابعًا،', 'ثامنًا،', 'تاسعًا،', 'عاشرًا،'],
    next: 'وأيضًا،',
    ordinalRe: /^(أولًا|ثانيًا|ثالثًا|رابعًا|خامسًا|سادسًا|سابعًا|ثامنًا|تاسعًا|عاشرًا|وأيضًا)،\s*/u,
    numWords: { اثنان: 2, اثنين: 2, ثلاث: 3, ثلاثة: 3, أربع: 4, أربعة: 4, خمس: 5, خمسة: 5, ست: 6, ستة: 6, سبع: 7, سبعة: 7, ثماني: 8, ثمانية: 8, تسع: 9, تسعة: 9, عشر: 10, عشرة: 10, مئة: 100, مائة: 100, ألف: 1000 },
    percent: 'في المئة|بالمئة|في المائة|بالمائة',
    scale: [['مليار', 1e9], ['مليون', 1e6]],
    ctaEmoji: [
      [/تعليق|اكتب|أخبرني/u, '💬'],
      [/احفظ/u, '📌'],
      [/شارك|أرسل/u, '📤'],
      [/تابع/u, '🔔'],
    ],
    ask: ['ما الذي أدهشك أكثر؟', 'هل كنت تعرف هذا؟', 'تابعني للمزيد.', 'احفظه لوقت لاحق.'],
    tags: {
      facts: ['هل_تعلم', 'معلومات', 'حقائق'],
      list: ['معلومات', 'حقائق', 'هل_تعلم'],
      explainer: ['معلومة', 'تعلم_على_تيك_توك', 'علوم'],
      story: ['قصة', 'قصص_حقيقية', 'حكايات'],
      mystery: ['لغز', 'غموض', 'ألغاز'],
      motivation: ['تحفيز', 'نجاح', 'تطوير_الذات'],
    },
    power: set('أبدا دائما سر مجانا أفضل أسوأ الوحيد أول آخر مليون مليار قاتل خطير مذهل مستحيل الجميع الحقيقة'),
    untitled: 'فيديو بلا عنوان',
    outline: (t, q, cta) => [q || `هذا ما تحتاج إلى معرفته عن ${t}.`, 'اكتب هنا نقطتك الأولى.', 'أضف نقطة ثانية، ويفضل أن تحتوي على رقم مدهش.', 'أضف نقطة أخرى لا يعرفها كثيرون.', cta],
    yourTopic: 'موضوعك',
    newLine: 'سطر جديد — انقر لتعديله.',
    madeWith: 'صُنع باستخدام AutoShorts',
    ideas: ['لماذا يملك الأخطبوط ثلاثة قلوب؟', 'لماذا ماء البحر مالح؟', 'كيف يعمل الكافيين؟', 'تاريخ القهوة', 'كيف يصنع النحل العسل؟', 'لماذا نحلم؟'],
    hookPlaceholder: 'موضوعك يصبح بداية الفيديو',
    credits: { facts: (t) => `المعلومات: ويكيبيديا، «${t}» (CC BY-SA 4.0)`, stock: (n) => `لقطات الفيديو: ${n} على Pexels` },
    wikiEnd: 'انظر أيضًا|انظر أيضا|المراجع|مراجع|وصلات خارجية|روابط خارجية|ملاحظات|مصادر|الهوامش',
  },
};

export const pack = (lang) => PACKS[normLang(lang)];

// ---------------------------------------------------------------- word normalisation per language

const AR_PREFIX = /^(?:و|ف)?(?:بال|كال|لل|ال)/u;
const HI_SUFFIX = /(ाओं|ियों|ों|ें|एं|ाएँ)$/u;

/** Light stemming so "corazón"/"corazones" or "الأخطبوط"/"أخطبوط" count as one word. */
export function stemFor(word, lang) {
  let w = String(word).toLocaleLowerCase();
  switch (lang) {
    case 'es':
    case 'pt':
      w = fold(w);
      if (w.length > 5 && /(oes|aes|ies)$/.test(w)) return w.slice(0, -2);
      if (w.length > 5 && /es$/.test(w) && !/[aeiou]es$/.test(w)) return w.slice(0, -2);
      if (w.length > 4 && /s$/.test(w)) return w.slice(0, -1);
      return w;
    case 'fr':
      w = fold(w);
      if (w.length > 5 && /aux$/.test(w)) return w.slice(0, -3) + 'al';
      if (w.length > 4 && /[sx]$/.test(w)) return w.slice(0, -1);
      return w;
    case 'de':
      w = fold(w).replace(/ß/g, 'ss');
      if (w.length > 6 && /(en|er)$/.test(w)) return w.slice(0, -2);
      if (w.length > 5 && /[ens]$/.test(w)) return w.slice(0, -1);
      return w;
    case 'ar': {
      w = w.replace(/[ً-ْـ]/g, ''); // vowel marks and tatweel
      if (w.length > 4) w = w.replace(AR_PREFIX, '');
      // dual/plural endings and attached pronouns: قلبان → قلب, دمه → دم
      const cut = w.length >= 5 ? w.replace(/(هما|كما|هم|هن|ها|كم|كن|نا|ان|ين|ون|ات)$/, '') : w.length >= 3 ? w.replace(/ه$/, '') : w;
      if (cut.length >= (w.length >= 5 ? 3 : 2)) w = cut;
      return w.replace(/[أإآ]/g, 'ا').replace(/ة$/, 'ه');
    }
    case 'hi':
      return w.length > 3 ? w.replace(HI_SUFFIX, '') : w;
    default:
      return w;
  }
}

/** Digits from Arabic-Indic and Devanagari numerals as ASCII, so numbers can be recognised. */
export function asciiDigits(s) {
  return String(s)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}
