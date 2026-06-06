// scripts/add-faqs.mjs
// One-off generator: adds a page-specific "Preguntas Frecuentes" accordion
// (matching the visitanos component) + matching FAQPage JSON-LD to each page.
//
// Idempotent: re-running skips any page that already has the auto FAQ marker.
// Run: node scripts/add-faqs.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '<!-- FAQ:auto -->';

// Answers may contain inline HTML (links); the JSON-LD copy is stripped to text.
const FAQ = {
  'index.html': [
    ['¿A qué hora son los servicios?', 'Servicio dominical de adoración: domingos a las 2:00 PM. Estudio bíblico: martes a las 7:00 PM. Servicio de oración: viernes a las 7:00 PM (hora del Este).'],
    ['¿Dónde se reúnen y hay estacionamiento?', 'Nos reunimos en 2601 Clays Mill Rd, Lexington, KY 40503. Hay estacionamiento gratuito en el lugar.'],
    ['¿Los servicios son en español?', 'Sí, todos nuestros servicios son en español. Eres bienvenido sin importar tu nivel del idioma.'],
    ['¿Qué puedo esperar en mi primera visita?', 'Un ambiente cálido y familiar. Ven como estés — no hay código de vestimenta. Aquí eres recibido, no juzgado. <a href="/visitanos/" class="email-link">Planea tu visita</a>.'],
    ['¿Tienen actividades para niños?', 'Sí. Tenemos escuela dominical para niños de 3:00 a 4:00 PM, donde aprenden la Palabra de Dios de forma apropiada para su edad.'],
  ],
  'quienes-somos/index.html': [
    ['¿Qué tipo de iglesia es Iglesia Restauración Divina?', 'Somos una iglesia cristiana hispana en Lexington, KY, que se reúne cada domingo a las 2:00 PM para adorar en español como una familia de fe.'],
    ['¿A qué denominación pertenecen?', 'Estamos afiliados al Kentucky Ministry Network, la red hispana de las Asambleas de Dios en Kentucky.'],
    ['¿Quién es el pastor?', 'El Pastor Raúl García Guerra es nuestro pastor principal. Conoce más en <a href="/quienes-somos/#nuestro-pastor" class="email-link">Nuestro Pastor</a>.'],
    ['¿En qué creen?', 'Creemos en Jesucristo como el Hijo de Dios y único Salvador, en la autoridad de la Biblia, en el bautismo en agua por inmersión y en la obra del Espíritu Santo. Lee más en <a href="/doctrina/" class="email-link">Doctrina</a>.'],
  ],
  'doctrina/index.html': [
    ['¿Creen que la Biblia es la Palabra de Dios?', 'Sí. Creemos que toda la Escritura es inspirada por Dios y es nuestra autoridad final para la fe y la vida.'],
    ['¿Qué creen sobre la salvación?', 'La salvación es un regalo de Dios por gracia, mediante la fe en Jesucristo — no se gana por obras ni por buenas acciones.'],
    ['¿Practican el bautismo en agua?', 'Sí, por inmersión, como una declaración pública de fe para quienes ya han creído en Cristo.'],
    ['¿Creen en el Espíritu Santo?', 'Sí. Como iglesia pentecostal, creemos en la persona y la obra continua del Espíritu Santo en la vida del creyente.'],
  ],
  'vision-valores/index.html': [
    ['¿Cuál es la misión de la iglesia?', 'Existimos para adorar a Dios, amar a nuestro prójimo y compartir las buenas nuevas de Jesús, formando discípulos que crezcan en su fe.'],
    ['¿Cuáles son sus valores?', 'Vivimos valores como la aceptación, el amor mutuo y la formación de discípulos — queremos que cada persona encuentre un hogar espiritual.'],
    ['¿Cómo puedo ser parte?', 'Ven y sé parte: visítanos un domingo o da tus <a href="/proximos-pasos/" class="email-link">próximos pasos</a> con nosotros.'],
  ],
  'proximos-pasos/index.html': [
    ['¿Cómo puedo recibir a Jesús?', 'La salvación comienza al creer en Jesús, arrepentirte del pecado y recibirlo como tu Señor. Con gusto oramos contigo — <a href="/contacto/" class="email-link">escríbenos</a> o háblanos un domingo.'],
    ['¿Cómo me bautizo?', 'El bautismo en agua es para quienes han creído en Cristo. Habla con nosotros y te guiaremos en este paso.'],
    ['¿Cómo puedo servir o involucrarme?', 'Hay muchas maneras de servir. Cuéntanos tus dones e intereses por medio del <a href="/contacto/" class="email-link">formulario de contacto</a> y te conectaremos.'],
    ['¿Necesito ser miembro para participar?', 'No. Todos son bienvenidos a adorar, servir y crecer con nosotros, sin importar dónde estés en tu camino de fe.'],
  ],
  'discipulado/index.html': [
    ['¿Qué es un grupo de discipulado?', 'Son grupos pequeños que se reúnen, normalmente en hogares, para estudiar la Biblia, orar y crecer juntos en la fe.'],
    ['¿Dónde y cuándo se reúnen?', 'Los grupos se reúnen durante la semana en distintos hogares; el día y la hora varían según el grupo.'],
    ['¿Necesito ser miembro para unirme?', 'No. Los grupos están abiertos a todos — es una excelente manera de conocer a otros y crecer en comunidad.'],
    ['¿Cómo me uno a un grupo?', 'Llena el formulario de interés en esta página y te conectaremos con un grupo cercano a ti.'],
  ],
  'eventos/index.html': [
    ['¿Cómo me entero de los próximos eventos?', 'Esta página se actualiza automáticamente con los próximos eventos. También puedes ver el <a href="/calendario/" class="email-link">calendario</a> completo.'],
    ['¿Los eventos tienen costo?', 'La mayoría de nuestros eventos son gratuitos. Si alguno tiene un costo, se indicará en los detalles del evento.'],
    ['¿Puedo invitar a familiares y amigos?', '¡Por supuesto! Todos son bienvenidos. Invitar a alguien es una hermosa manera de compartir la fe.'],
    ['¿Puedo agregar un evento a mi calendario?', 'Sí. Al abrir un evento encontrarás un botón para agregarlo a tu calendario de Google.'],
  ],
  'sermones/index.html': [
    ['¿Dónde puedo ver los sermones?', 'Aquí mismo en esta página, o en nuestro canal de YouTube, donde publicamos nuestras predicaciones.'],
    ['¿Los sermones están en español?', 'Sí, todas nuestras predicaciones son en español.'],
    ['¿Puedo ver los servicios en vivo?', 'Transmitimos en vivo por YouTube durante nuestros servicios. Suscríbete al canal para recibir aviso.'],
    ['¿Puedo ver predicaciones anteriores?', 'Sí. Tenemos un archivo de series y sermones que puedes ver cuando quieras.'],
  ],
  'donacion/index.html': [
    ['¿Cómo puedo dar mi ofrenda o diezmo?', 'Puedes dar en persona durante el servicio dominical. Las donaciones en línea estarán disponibles muy pronto.'],
    ['¿Para qué se usa mi donación?', 'Tu generosidad sostiene los servicios, los ministerios y el alcance a nuestra comunidad en Lexington.'],
    ['¿Hay otras maneras de ayudar además de dar?', 'Sí. Puedes ayudar en oración y evangelizando, o sirviendo en uno de nuestros ministerios.'],
    ['¿Tengo que ser miembro para dar?', 'No. Dar es un acto voluntario de adoración y agradecimiento a Dios; cualquiera puede participar.'],
  ],
  'contacto/index.html': [
    ['¿En cuánto tiempo responden?', 'Respondemos lo antes posible, normalmente en pocos días.'],
    ['¿De qué otras maneras puedo comunicarme?', 'Por teléfono al <a href="tel:+18592708521" class="email-link">(859) 270-8521</a>, por correo a <a href="mailto:contactanos@irdlex.org" class="email-link">contactanos@irdlex.org</a>, o por WhatsApp.'],
    ['¿Dónde están ubicados?', 'En 2601 Clays Mill Rd, Lexington, KY 40503, con estacionamiento gratuito.'],
  ],
  'calendario/index.html': [
    ['¿Cuáles son los horarios de los servicios?', 'Servicio dominical: domingos 2:00 PM. Estudio bíblico: martes 7:00 PM. Servicio de oración: viernes 7:00 PM (hora del Este).'],
    ['¿Cómo agrego un evento a mi calendario?', 'Abre el evento en la página de <a href="/eventos/" class="email-link">eventos</a> y usa el botón para agregarlo a tu calendario de Google.'],
    ['¿Se cancelan los servicios en días festivos?', 'En ocasiones especiales el horario puede cambiar. Revisa el calendario o <a href="/contacto/" class="email-link">contáctanos</a> para confirmar.'],
  ],
  'galeria/index.html': [
    ['¿Puedo usar o compartir estas fotos?', 'Las fotos son para la comunidad de nuestra iglesia. Si deseas usarlas para otro fin, <a href="/contacto/" class="email-link">escríbenos</a>.'],
    ['No deseo aparecer en las fotos. ¿Qué hago?', 'Lo entendemos. Contáctanos y con gusto retiraremos tu imagen de la galería.'],
  ],
};

const stripTags = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const jsonEsc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

function chevronIcons() {
  return `<span class="accordion-faq__icon" aria-hidden="true">
                <svg class="accordion-faq__chevron" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
                <svg class="accordion-faq__x" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>`;
}

function buildSection(items) {
  const blocks = items.map(([q, a]) => `
          <div class="accordion-faq__item">
            <button class="accordion-faq__question" aria-expanded="false">
              ${q}
              ${chevronIcons()}
            </button>
            <div class="accordion-faq__answer">
              ${a}
            </div>
          </div>`).join('\n');
  return `      ${MARKER}
      <section class="section--accordion-faq">
        <div class="accordion-faq__wrapper">
          <div class="section-divider">
            <hr class="section-divider__line" />
            <h2 class="section-divider__text animate-fade-in" data-threshold="1">Preguntas Frecuentes</h2>
            <hr class="section-divider__line" />
          </div>
${blocks}
        </div>
      </section>

`;
}

function buildJsonLd(items) {
  const entities = items.map(([q, a]) => `        {
          "@type": "Question",
          "name": "${jsonEsc(stripTags(q))}",
          "acceptedAnswer": { "@type": "Answer", "text": "${jsonEsc(stripTags(a))}" }
        }`).join(',\n');
  return `    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
${entities}
      ]
    }
    </script>
`;
}

let changed = 0, skipped = 0;
for (const [rel, items] of Object.entries(FAQ)) {
  const file = resolve(ROOT, rel);
  if (!existsSync(file)) { console.log(`MISSING: ${rel}`); continue; }
  let html = readFileSync(file, 'utf8');
  if (html.includes(MARKER)) { skipped++; console.log(`skip (already has FAQ): ${rel}`); continue; }

  const section = buildSection(items);
  if (html.includes('<section id="contact-form">')) {
    html = html.replace('<section id="contact-form">', section + '      <section id="contact-form">');
  } else if (html.includes('</main>')) {
    html = html.replace('</main>', section + '    </main>');
  } else {
    console.log(`NO ANCHOR (skipped): ${rel}`); continue;
  }

  // Inject FAQPage JSON-LD before </head> if the page has no FAQPage yet.
  if (!html.includes('"FAQPage"') && html.includes('</head>')) {
    html = html.replace('</head>', buildJsonLd(items) + '</head>');
  }

  writeFileSync(file, html, 'utf8');
  changed++;
  console.log(`OK (${items.length} Q): ${rel}`);
}
console.log(`\nDone. ${changed} updated, ${skipped} skipped.`);
