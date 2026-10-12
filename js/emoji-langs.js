// Keyword → emoji maps for the non-English video languages, written as emoji → words. Words are
// stemmed with the language's own rules when the map is built, so plurals and articles still match.

import { stemFor } from './langs.js';

const SRC = {
  es: {
    '🐙': 'pulpo', '🦑': 'calamar', '🦈': 'tiburón', '🐋': 'ballena', '🐬': 'delfín', '🐟': 'pez peces pescado', '🐱': 'gato gata', '🐶': 'perro perra', '🐦': 'pájaro ave', '🐝': 'abeja', '🐜': 'hormiga', '🕷️': 'araña', '🐍': 'serpiente', '🦁': 'león', '🐯': 'tigre', '🐘': 'elefante', '🐴': 'caballo', '🐒': 'mono', '🐻': 'oso', '🐺': 'lobo', '🦋': 'mariposa', '🦖': 'dinosaurio', '🐾': 'animal mascota',
    '🌊': 'océano mar ola', '💧': 'agua', '🏞️': 'río lago', '⛰️': 'montaña', '🌲': 'bosque', '🌳': 'árbol', '🌸': 'flor', '🌱': 'planta semilla', '☀️': 'sol', '🌙': 'luna noche', '⭐': 'estrella', '🪐': 'planeta saturno júpiter', '🔴': 'marte', '🌍': 'tierra mundo', '🚀': 'espacio cohete', '👩‍🚀': 'astronauta', '🌤️': 'cielo', '☁️': 'nube', '🌧️': 'lluvia', '❄️': 'nieve', '🧊': 'hielo', '🔥': 'fuego calor', '🥶': 'frío', '🌬️': 'viento', '⛈️': 'tormenta', '🌋': 'volcán', '🏜️': 'desierto', '🏝️': 'isla', '🏖️': 'playa',
    '❤️': 'corazón amor', '🩸': 'sangre', '🧠': 'cerebro mente memoria', '👁️': 'ojo', '🦴': 'hueso', '😴': 'sueño dormir', '🩺': 'salud médico', '💊': 'medicina pastilla', '🦠': 'virus bacteria', '💪': 'músculo fuerza', '🦷': 'diente',
    '☕': 'café cafeína', '🍬': 'azúcar', '🧂': 'sal', '🍞': 'pan', '🍕': 'pizza', '🍫': 'chocolate', '🍎': 'manzana', '🍌': 'plátano', '🍯': 'miel', '🥛': 'leche', '🥚': 'huevo', '🧀': 'queso', '🍚': 'arroz', '🍽️': 'comida', '🍵': 'té',
    '💰': 'dinero rico riqueza', '🥇': 'oro', '🏦': 'banco', '💼': 'negocio trabajo empresa', '🏷️': 'precio',
    '📱': 'teléfono móvil celular', '💻': 'ordenador computadora', '🌐': 'internet', '🤖': 'robot', '🎮': 'juego videojuego', '🎬': 'película video', '📷': 'cámara foto', '🚗': 'coche auto', '✈️': 'avión viaje', '🚆': 'tren', '🚢': 'barco', '🚲': 'bicicleta',
    '👶': 'bebé', '🧒': 'niño niña', '🤝': 'amigo amistad', '🏫': 'escuela colegio', '🧑‍🎓': 'estudiante', '🧑‍🏫': 'profesor maestro', '📖': 'libro', '📜': 'manuscrito historia', '📝': 'examen', '📚': 'estudio estudiar', '🎵': 'música canción', '⚽': 'fútbol deporte', '🏃': 'correr', '🏋️': 'gimnasio',
    '⏰': 'tiempo reloj hora', '🌅': 'mañana amanecer', '⚔️': 'guerra batalla', '👑': 'rey reina imperio', '🏰': 'castillo', '🔺': 'pirámide egipto', '🏛️': 'roma',
    '🔬': 'ciencia', '🧑‍🔬': 'científico', '🧪': 'experimento carbono químico', '⚛️': 'átomo física', '⚡': 'energía electricidad rayo', '💡': 'luz idea', '🔊': 'sonido',
    '😊': 'feliz felicidad', '😢': 'triste', '😱': 'miedo', '😂': 'risa', '🤫': 'secreto', '🕵️': 'misterio', '❓': 'pregunta', '🏆': 'éxito', '🎯': 'meta objetivo', '🔁': 'hábito', '🏠': 'casa', '🏙️': 'ciudad', '🗺️': 'mapa país', '🫁': 'oxígeno pulmón',
  },
  fr: {
    '🐙': 'pieuvre poulpe', '🦑': 'calmar', '🦈': 'requin', '🐋': 'baleine', '🐬': 'dauphin', '🐟': 'poisson', '🐱': 'chat', '🐶': 'chien', '🐦': 'oiseau', '🐝': 'abeille', '🐜': 'fourmi', '🕷️': 'araignée', '🐍': 'serpent', '🦁': 'lion', '🐯': 'tigre', '🐘': 'éléphant', '🐴': 'cheval', '🐒': 'singe', '🐻': 'ours', '🐺': 'loup', '🦋': 'papillon', '🦖': 'dinosaure', '🐾': 'animal',
    '🌊': 'océan mer vague', '💧': 'eau', '🏞️': 'rivière fleuve lac', '⛰️': 'montagne', '🌲': 'forêt', '🌳': 'arbre', '🌸': 'fleur', '🌱': 'plante graine', '☀️': 'soleil', '🌙': 'lune nuit', '⭐': 'étoile', '🪐': 'planète saturne jupiter', '🔴': 'mars', '🌍': 'terre monde', '🚀': 'espace fusée', '👩‍🚀': 'astronaute', '🌤️': 'ciel', '☁️': 'nuage', '🌧️': 'pluie', '❄️': 'neige', '🧊': 'glace', '🔥': 'feu chaleur', '🥶': 'froid', '🌬️': 'vent', '⛈️': 'tempête orage', '🌋': 'volcan', '🏜️': 'désert', '🏝️': 'île', '🏖️': 'plage',
    '❤️': 'cœur coeur amour', '🩸': 'sang', '🧠': 'cerveau esprit mémoire', '👁️': 'œil yeux', '🦴': 'os', '😴': 'sommeil dormir rêve', '🩺': 'santé médecin', '💊': 'médicament', '🦠': 'virus bactérie', '💪': 'muscle force', '🦷': 'dent',
    '☕': 'café caféine', '🍬': 'sucre', '🧂': 'sel', '🍞': 'pain', '🍕': 'pizza', '🍫': 'chocolat', '🍎': 'pomme', '🍌': 'banane', '🍯': 'miel', '🥛': 'lait', '🥚': 'œuf', '🧀': 'fromage', '🍚': 'riz', '🍽️': 'nourriture repas', '🍵': 'thé',
    '💰': 'argent riche richesse', '🥇': 'or', '🏦': 'banque', '💼': 'travail entreprise affaire', '🏷️': 'prix',
    '📱': 'téléphone portable', '💻': 'ordinateur', '🌐': 'internet', '🤖': 'robot', '🎮': 'jeu', '🎬': 'film vidéo', '📷': 'caméra photo', '🚗': 'voiture', '✈️': 'avion voyage', '🚆': 'train', '🚢': 'bateau navire', '🚲': 'vélo',
    '👶': 'bébé', '🧒': 'enfant', '🤝': 'ami amitié', '🏫': 'école', '🧑‍🎓': 'étudiant élève', '🧑‍🏫': 'professeur', '📖': 'livre', '📜': 'manuscrit histoire', '📝': 'examen', '📚': 'étude étudier', '🎵': 'musique chanson', '⚽': 'football sport', '🏃': 'courir course',
    '⏰': 'temps heure horloge', '🌅': 'matin', '⚔️': 'guerre bataille', '👑': 'roi reine empire', '🏰': 'château', '🔺': 'pyramide égypte', '🏛️': 'rome',
    '🔬': 'science', '🧑‍🔬': 'scientifique chercheur', '🧪': 'expérience carbone chimie', '⚛️': 'atome physique', '⚡': 'énergie électricité foudre', '💡': 'lumière idée', '🔊': 'son bruit',
    '😊': 'heureux bonheur', '😢': 'triste', '😱': 'peur', '😂': 'rire', '🤫': 'secret', '🕵️': 'mystère énigme', '❓': 'question', '🏆': 'succès réussite', '🎯': 'objectif but', '🔁': 'habitude', '🏠': 'maison', '🏙️': 'ville', '🗺️': 'carte pays', '🫁': 'oxygène poumon',
  },
  de: {
    '🐙': 'Oktopus Krake Tintenfisch', '🦈': 'Hai', '🐋': 'Wal', '🐬': 'Delfin', '🐟': 'Fisch', '🐱': 'Katze', '🐶': 'Hund', '🐦': 'Vogel', '🐝': 'Biene', '🐜': 'Ameise', '🕷️': 'Spinne', '🐍': 'Schlange', '🦁': 'Löwe', '🐯': 'Tiger', '🐘': 'Elefant', '🐴': 'Pferd', '🐒': 'Affe', '🐻': 'Bär', '🐺': 'Wolf', '🦋': 'Schmetterling', '🦖': 'Dinosaurier', '🐾': 'Tier',
    '🌊': 'Ozean Meer Welle', '💧': 'Wasser', '🏞️': 'Fluss See', '⛰️': 'Berg', '🌲': 'Wald', '🌳': 'Baum', '🌸': 'Blume Blüte', '🌱': 'Pflanze Samen', '☀️': 'Sonne', '🌙': 'Mond Nacht', '⭐': 'Stern', '🪐': 'Planet Saturn Jupiter', '🔴': 'Mars', '🌍': 'Erde Welt', '🚀': 'Weltraum Rakete All', '👩‍🚀': 'Astronaut', '🌤️': 'Himmel', '☁️': 'Wolke', '🌧️': 'Regen', '❄️': 'Schnee', '🧊': 'Eis', '🔥': 'Feuer Hitze', '🥶': 'Kälte kalt', '🌬️': 'Wind', '⛈️': 'Sturm Gewitter', '🌋': 'Vulkan', '🏜️': 'Wüste', '🏝️': 'Insel', '🏖️': 'Strand',
    '❤️': 'Herz Liebe', '🩸': 'Blut', '🧠': 'Gehirn Hirn Gedächtnis', '👁️': 'Auge', '🦴': 'Knochen', '😴': 'Schlaf schlafen Traum', '🩺': 'Gesundheit Arzt', '💊': 'Medizin Medikament', '🦠': 'Virus Bakterie', '💪': 'Muskel Kraft', '🦷': 'Zahn',
    '☕': 'Kaffee Koffein', '🍬': 'Zucker', '🧂': 'Salz', '🍞': 'Brot', '🍕': 'Pizza', '🍫': 'Schokolade', '🍎': 'Apfel', '🍌': 'Banane', '🍯': 'Honig', '🥛': 'Milch', '🥚': 'Ei', '🧀': 'Käse', '🍚': 'Reis', '🍽️': 'Essen', '🍵': 'Tee',
    '💰': 'Geld reich Reichtum', '🥇': 'Gold', '🏦': 'Bank', '💼': 'Arbeit Firma Geschäft Job', '🏷️': 'Preis',
    '📱': 'Handy Telefon Smartphone', '💻': 'Computer Laptop', '🌐': 'Internet', '🤖': 'Roboter', '🎮': 'Spiel', '🎬': 'Film Video', '📷': 'Kamera Foto', '🚗': 'Auto', '✈️': 'Flugzeug Reise', '🚆': 'Zug', '🚢': 'Schiff', '🚲': 'Fahrrad',
    '👶': 'Baby', '🧒': 'Kind', '🤝': 'Freund Freundschaft', '🏫': 'Schule', '🧑‍🎓': 'Student Schüler', '🧑‍🏫': 'Lehrer', '📖': 'Buch', '📜': 'Handschrift Manuskript Geschichte', '📝': 'Prüfung Test', '📚': 'Lernen Studium', '🎵': 'Musik Lied', '⚽': 'Fußball Sport', '🏃': 'Laufen',
    '⏰': 'Uhr Stunde', '🌅': 'Morgen', '⚔️': 'Krieg Schlacht', '👑': 'König Königin Reich', '🏰': 'Burg Schloss', '🔺': 'Pyramide Ägypten', '🏛️': 'Rom',
    '🔬': 'Wissenschaft', '🧑‍🔬': 'Wissenschaftler Forscher', '🧪': 'Experiment Kohlenstoff Chemie', '⚛️': 'Atom Physik', '⚡': 'Energie Strom Blitz', '💡': 'Licht Idee', '🔊': 'Ton Schall',
    '😊': 'glücklich Glück', '😢': 'traurig', '😱': 'Angst', '😂': 'Lachen', '🤫': 'Geheimnis', '🕵️': 'Rätsel Mysterium', '❓': 'Frage', '🏆': 'Erfolg', '🎯': 'Ziel', '🔁': 'Gewohnheit', '🏠': 'Haus', '🏙️': 'Stadt', '🗺️': 'Karte Land', '🫁': 'Sauerstoff Lunge',
  },
  pt: {
    '🐙': 'polvo', '🦑': 'lula', '🦈': 'tubarão', '🐋': 'baleia', '🐬': 'golfinho', '🐟': 'peixe', '🐱': 'gato gata', '🐶': 'cachorro cão', '🐦': 'pássaro ave', '🐝': 'abelha', '🐜': 'formiga', '🕷️': 'aranha', '🐍': 'cobra serpente', '🦁': 'leão', '🐯': 'tigre', '🐘': 'elefante', '🐴': 'cavalo', '🐒': 'macaco', '🐻': 'urso', '🐺': 'lobo', '🦋': 'borboleta', '🦖': 'dinossauro', '🐾': 'animal',
    '🌊': 'oceano mar onda', '💧': 'água', '🏞️': 'rio lago', '⛰️': 'montanha', '🌲': 'floresta', '🌳': 'árvore', '🌸': 'flor', '🌱': 'planta semente', '☀️': 'sol', '🌙': 'lua noite', '⭐': 'estrela', '🪐': 'planeta saturno júpiter', '🔴': 'marte', '🌍': 'terra mundo', '🚀': 'espaço foguete', '👩‍🚀': 'astronauta', '🌤️': 'céu', '☁️': 'nuvem', '🌧️': 'chuva', '❄️': 'neve', '🧊': 'gelo', '🔥': 'fogo calor', '🥶': 'frio', '🌬️': 'vento', '⛈️': 'tempestade', '🌋': 'vulcão', '🏜️': 'deserto', '🏝️': 'ilha', '🏖️': 'praia',
    '❤️': 'coração amor', '🩸': 'sangue', '🧠': 'cérebro mente memória', '👁️': 'olho', '🦴': 'osso', '😴': 'sono dormir sonho', '🩺': 'saúde médico', '💊': 'remédio medicamento', '🦠': 'vírus bactéria', '💪': 'músculo força', '🦷': 'dente',
    '☕': 'café cafeína', '🍬': 'açúcar', '🧂': 'sal', '🍞': 'pão', '🍕': 'pizza', '🍫': 'chocolate', '🍎': 'maçã', '🍌': 'banana', '🍯': 'mel', '🥛': 'leite', '🥚': 'ovo', '🧀': 'queijo', '🍚': 'arroz', '🍽️': 'comida', '🍵': 'chá',
    '💰': 'dinheiro rico riqueza', '🥇': 'ouro', '🏦': 'banco', '💼': 'trabalho empresa negócio emprego', '🏷️': 'preço',
    '📱': 'celular telefone', '💻': 'computador', '🌐': 'internet', '🤖': 'robô', '🎮': 'jogo videogame', '🎬': 'filme vídeo', '📷': 'câmera foto', '🚗': 'carro', '✈️': 'avião viagem', '🚆': 'trem', '🚢': 'navio barco', '🚲': 'bicicleta',
    '👶': 'bebê', '🧒': 'criança', '🤝': 'amigo amizade', '🏫': 'escola', '🧑‍🎓': 'estudante aluno', '🧑‍🏫': 'professor', '📖': 'livro', '📜': 'manuscrito história', '📝': 'prova exame', '📚': 'estudo estudar', '🎵': 'música canção', '⚽': 'futebol esporte', '🏃': 'correr corrida',
    '⏰': 'tempo relógio hora', '🌅': 'manhã', '⚔️': 'guerra batalha', '👑': 'rei rainha império', '🏰': 'castelo', '🔺': 'pirâmide egito', '🏛️': 'roma',
    '🔬': 'ciência', '🧑‍🔬': 'cientista pesquisador', '🧪': 'experimento carbono química', '⚛️': 'átomo física', '⚡': 'energia eletricidade raio', '💡': 'luz ideia', '🔊': 'som',
    '😊': 'feliz felicidade', '😢': 'triste', '😱': 'medo', '😂': 'riso risada', '🤫': 'segredo', '🕵️': 'mistério', '❓': 'pergunta', '🏆': 'sucesso', '🎯': 'meta objetivo', '🔁': 'hábito', '🏠': 'casa', '🏙️': 'cidade', '🗺️': 'mapa país', '🫁': 'oxigênio pulmão',
  },
  hi: {
    '🐙': 'ऑक्टोपस', '🦈': 'शार्क', '🐋': 'व्हेल', '🐬': 'डॉल्फ़िन डॉल्फिन', '🐟': 'मछली', '🐱': 'बिल्ली', '🐶': 'कुत्ता', '🐦': 'पक्षी चिड़िया', '🐝': 'मधुमक्खी मधुमक्खियाँ', '🐜': 'चींटी', '🕷️': 'मकड़ी', '🐍': 'सांप साँप', '🦁': 'शेर', '🐯': 'बाघ', '🐘': 'हाथी', '🐴': 'घोड़ा', '🐒': 'बंदर', '🐻': 'भालू', '🐺': 'भेड़िया', '🦋': 'तितली', '🦖': 'डायनासोर', '🐾': 'जानवर',
    '🌊': 'समुद्र सागर लहर महासागर', '💧': 'पानी जल', '🏞️': 'नदी झील', '⛰️': 'पहाड़ पर्वत', '🌲': 'जंगल', '🌳': 'पेड़ वृक्ष', '🌸': 'फूल', '🌱': 'पौधा बीज', '☀️': 'सूरज सूर्य', '🌙': 'चाँद चंद्रमा रात', '⭐': 'तारा सितारा', '🪐': 'ग्रह शनि बृहस्पति', '🔴': 'मंगल', '🌍': 'पृथ्वी धरती दुनिया', '🚀': 'अंतरिक्ष रॉकेट', '🌤️': 'आसमान आकाश', '☁️': 'बादल', '🌧️': 'बारिश वर्षा', '❄️': 'बर्फ़ बर्फ', '🔥': 'आग गर्मी', '🌬️': 'हवा', '🌋': 'ज्वालामुखी', '🏜️': 'रेगिस्तान', '🏝️': 'द्वीप', '🏖️': 'समुद्रतट',
    '❤️': 'दिल हृदय प्यार', '🩸': 'खून रक्त', '🧠': 'दिमाग मस्तिष्क याददाश्त', '👁️': 'आँख', '🦴': 'हड्डी', '😴': 'नींद सोना सपना सपने', '🩺': 'स्वास्थ्य डॉक्टर', '💊': 'दवा दवाई', '🦠': 'वायरस बैक्टीरिया', '💪': 'मांसपेशी ताकत', '🦷': 'दाँत',
    '☕': 'कॉफ़ी कॉफी कैफ़ीन कैफीन', '🍵': 'चाय', '🍬': 'चीनी', '🧂': 'नमक खारा', '🍞': 'रोटी', '🍕': 'पिज़्ज़ा', '🍫': 'चॉकलेट', '🍎': 'सेब', '🍌': 'केला', '🍯': 'शहद', '🥛': 'दूध', '🥚': 'अंडा', '🍚': 'चावल', '🍽️': 'खाना भोजन',
    '💰': 'पैसा धन अमीर', '🥇': 'सोना', '🏦': 'बैंक', '💼': 'काम नौकरी व्यापार बिज़नेस', '🏷️': 'कीमत',
    '📱': 'फ़ोन फोन मोबाइल', '💻': 'कंप्यूटर', '🌐': 'इंटरनेट', '🤖': 'रोबोट', '🎮': 'गेम खेल', '🎬': 'फ़िल्म फिल्म वीडियो', '📷': 'कैमरा फ़ोटो', '🚗': 'कार गाड़ी', '✈️': 'हवाईजहाज़ यात्रा', '🚆': 'ट्रेन रेल', '🚢': 'जहाज़', '🚲': 'साइकिल',
    '👶': 'बच्चा', '🤝': 'दोस्त दोस्ती', '🏫': 'स्कूल विद्यालय', '🧑‍🎓': 'छात्र विद्यार्थी', '🧑‍🏫': 'शिक्षक', '📖': 'किताब पुस्तक', '📜': 'इतिहास', '📝': 'परीक्षा', '📚': 'पढ़ाई', '🎵': 'संगीत गाना', '⚽': 'फ़ुटबॉल क्रिकेट', '🏃': 'दौड़',
    '⏰': 'समय घड़ी', '🌅': 'सुबह', '⚔️': 'युद्ध लड़ाई', '👑': 'राजा रानी साम्राज्य', '🏰': 'किला महल', '🔺': 'पिरामिड मिस्र',
    '🔬': 'विज्ञान', '🧑‍🔬': 'वैज्ञानिक', '🧪': 'प्रयोग कार्बन रसायन', '⚛️': 'परमाणु भौतिकी', '⚡': 'ऊर्जा बिजली', '💡': 'रोशनी प्रकाश विचार', '🔊': 'आवाज़ ध्वनि',
    '😊': 'खुश ख़ुशी', '😢': 'दुखी उदास', '😱': 'डर', '😂': 'हँसी', '🤫': 'राज़', '🕵️': 'रहस्य', '❓': 'सवाल प्रश्न', '🏆': 'सफलता', '🎯': 'लक्ष्य', '🔁': 'आदत आदतें', '🏠': 'घर', '🏙️': 'शहर', '🗺️': 'नक्शा देश', '🫁': 'ऑक्सीजन फेफड़े',
  },
  ar: {
    '🐙': 'أخطبوط', '🦑': 'حبار', '🦈': 'قرش', '🐋': 'حوت', '🐬': 'دلفين', '🐟': 'سمك سمكة أسماك', '🐱': 'قط قطة', '🐶': 'كلب', '🐦': 'طائر عصفور طيور', '🐝': 'نحل نحلة', '🐜': 'نمل نملة', '🕷️': 'عنكبوت', '🐍': 'ثعبان أفعى', '🦁': 'أسد', '🐯': 'نمر', '🐘': 'فيل', '🐴': 'حصان', '🐒': 'قرد', '🐻': 'دب', '🐺': 'ذئب', '🦋': 'فراشة', '🦖': 'ديناصور', '🐪': 'جمل', '🐾': 'حيوان حيوانات',
    '🌊': 'محيط بحر موج', '💧': 'ماء مياه', '🏞️': 'نهر بحيرة', '⛰️': 'جبل جبال', '🌲': 'غابة', '🌳': 'شجرة أشجار', '🌸': 'زهرة ورد', '🌱': 'نبات بذرة', '☀️': 'شمس', '🌙': 'قمر ليل', '⭐': 'نجم نجوم', '🪐': 'كوكب زحل المشتري', '🔴': 'المريخ', '🌍': 'أرض عالم', '🚀': 'فضاء صاروخ', '👩‍🚀': 'رائد', '🌤️': 'سماء', '☁️': 'سحاب غيوم', '🌧️': 'مطر', '❄️': 'ثلج', '🧊': 'جليد', '🔥': 'نار حرارة', '🌬️': 'رياح', '🌋': 'بركان', '🏜️': 'صحراء', '🏝️': 'جزيرة', '🏖️': 'شاطئ',
    '❤️': 'قلب قلوب حب', '🩸': 'دم', '🧠': 'دماغ مخ عقل ذاكرة', '👁️': 'عين', '🦴': 'عظم عظام', '😴': 'نوم حلم أحلام', '🩺': 'صحة طبيب', '💊': 'دواء', '🦠': 'فيروس بكتيريا', '💪': 'عضلة قوة', '🦷': 'سن أسنان',
    '☕': 'قهوة كافيين', '🍵': 'شاي', '🍬': 'سكر', '🧂': 'ملح مالح', '🍞': 'خبز', '🍕': 'بيتزا', '🍫': 'شوكولاتة', '🍎': 'تفاح تفاحة', '🍌': 'موز', '🍯': 'عسل', '🥛': 'حليب', '🥚': 'بيض', '🍚': 'أرز', '🍽️': 'طعام أكل',
    '💰': 'مال ثروة غني', '🥇': 'ذهب', '🏦': 'بنك', '💼': 'عمل شركة تجارة وظيفة', '🏷️': 'سعر',
    '📱': 'هاتف جوال', '💻': 'حاسوب كمبيوتر', '🌐': 'إنترنت', '🤖': 'روبوت', '🎮': 'لعبة ألعاب', '🎬': 'فيلم فيديو', '📷': 'كاميرا صورة', '🚗': 'سيارة', '✈️': 'طائرة سفر', '🚆': 'قطار', '🚢': 'سفينة', '🚲': 'دراجة',
    '👶': 'طفل رضيع', '🤝': 'صديق صداقة', '🏫': 'مدرسة', '🧑‍🎓': 'طالب', '🧑‍🏫': 'معلم', '📖': 'كتاب', '📜': 'مخطوطة تاريخ', '📝': 'امتحان اختبار', '📚': 'دراسة مذاكرة', '🎵': 'موسيقى أغنية', '⚽': 'كرة رياضة', '🏃': 'جري',
    '⏰': 'وقت ساعة', '🌅': 'صباح', '⚔️': 'حرب معركة', '👑': 'ملك ملكة إمبراطورية', '🏰': 'قلعة', '🔺': 'هرم أهرامات مصر',
    '🔬': 'علم علوم', '🧑‍🔬': 'عالم علماء', '🧪': 'تجربة كربون كيمياء', '⚛️': 'ذرة فيزياء', '⚡': 'طاقة كهرباء برق', '💡': 'ضوء نور فكرة', '🔊': 'صوت',
    '😊': 'سعادة سعيد', '😢': 'حزن حزين', '😱': 'خوف', '😂': 'ضحك', '🤫': 'سر أسرار', '🕵️': 'لغز غموض', '❓': 'سؤال', '🏆': 'نجاح', '🎯': 'هدف', '🔁': 'عادة عادات', '🏠': 'بيت منزل', '🏙️': 'مدينة', '🗺️': 'خريطة دولة', '🫁': 'أكسجين رئة',
  },
};

const MAPS = {};
for (const [lang, src] of Object.entries(SRC)) {
  const m = new Map();
  for (const [emoji, words] of Object.entries(src)) {
    for (const w of words.split(/\s+/)) {
      if (!w) continue;
      const k = stemFor(w, lang);
      if (!m.has(k)) m.set(k, emoji);
    }
  }
  MAPS[lang] = m;
}

export function emojiForLang(word, lang) {
  const m = MAPS[lang];
  if (!m || !word) return '';
  return m.get(stemFor(word, lang)) || '';
}
