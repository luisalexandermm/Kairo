#!/usr/bin/env node
/**
 * Carga los productos de ejemplo (tenis, botas, sandalias y chanclas) y promociones en Supabase.
 * Úsalo UNA sola vez después de crear las tablas:
 *   node lib/seed-db.js
 *
 * Necesita el archivo .env con SUPABASE_URL y SUPABASE_SERVICE_KEY.
 */
require('./env');
const supabase = require('./supabase');

/* Promociones de ejemplo desactivadas: el carrito NO aplica descuentos ni envío gratis
   automáticamente. Publicar una promoción que no se cobra así es publicidad engañosa
   (Ley 1480, arts. 29-33). Actívalas solo si las vas a respetar, con condiciones y fechas. */
const SIZES_SHOE = [34,35,36,37,38,39,40,41,42,43,44];
const SIZES_W = [34,35,36,37,38,39,40];
const SIZES_FLIP = [35,36,37,38,39,40,41,42,43,44];

const PRODUCTS = [
  { id:'nike-air-max-270',      brand:'Nike',       name:'Air Max 270',            price:749900, tag:'Lifestyle',        category:'Tenis', gender:'Unisex', shape:'s-low',  shoe_color:'#1d2733', bg:'#f3ece3', description:'Unidad Air visible en el talón y parte superior en malla.',       sizes:SIZES_SHOE, colors:[{n:'Negro/Rojo',h:'#1d2733'},{n:'Blanco',h:'#e9e6df'},{n:'Azul',h:'#1d4ed8'}], stock:12, active:true, featured:true,  position:1 },
  { id:'nike-air-force-1',      brand:'Nike',       name:"Air Force 1 '07",        price:529900, tag:'Clásico',          category:'Tenis', gender:'Unisex', shape:'s-low',  shoe_color:'#e4e1d8', bg:'#eef0f2', description:'Parte superior en cuero, suela de goma y amortiguación Air en la entresuela.',              sizes:SIZES_SHOE, colors:[{n:'Blanco',h:'#e4e1d8'},{n:'Negro',h:'#171a1f'},{n:'Crema',h:'#d8c9ad'}],         stock:20, active:true, featured:false, position:2 },
  { id:'nike-pegasus-41',       brand:'Nike',       name:'Air Zoom Pegasus 41',    price:669900, sale_price:599900, tag:'Running', category:'Tenis', gender:'Unisex', shape:'s-low', shoe_color:'#2f6f8f', bg:'#e7f0f4', description:'Modelo de running con espuma ReactX y unidades Zoom Air.', sizes:SIZES_SHOE, colors:[{n:'Azul',h:'#2f6f8f'},{n:'Negro',h:'#1a1d22'},{n:'Verde',h:'#3f7d4c'}], stock:8, active:true, featured:false, position:3 },
  { id:'jordan-1-mid',          brand:'Jordan',     name:'Air Jordan 1 Mid',       price:759900, tag:'Caña media',            category:'Tenis', gender:'Unisex', shape:'s-high', shoe_color:'#a4123a', bg:'#f1e7ea', description:'Caña media con cuello acolchado, cuero en el empeine y unidad Air encapsulada.',              sizes:SIZES_SHOE, colors:[{n:'Rojo/Blanco',h:'#a4123a'},{n:'Negro',h:'#16181d'},{n:'Verde',h:'#1f5c3d'},{n:'Amarillo',h:'#d9a021'}], stock:15, active:true, featured:true, position:4 },
  { id:'jordan-1-zoom-cmft',    brand:'Jordan',     name:'Air Jordan 1 Zoom Cmft', price:849900, tag:'Comodidad',        category:'Tenis', gender:'Unisex', shape:'s-high', shoe_color:'#5b6470', bg:'#eceef0', description:'La silueta original con amortiguación Zoom de perfil bajo y cuello acolchado que sujeta el talón.',       sizes:SIZES_SHOE, colors:[{n:'Gris/Rojo',h:'#5b6470'},{n:'Blanco',h:'#e5e2da'},{n:'Morado',h:'#4b2e83'}], stock:6, active:true, featured:false, position:5 },
  { id:'jordan-retro-high-og',  brand:'Jordan',     name:'Air Jordan 1 Retro High OG', price:1179900, tag:'Caña alta', category:'Tenis', gender:'Unisex', shape:'s-high', shoe_color:'#e0a12b', bg:'#f6eee0', description:'Corte alto en cuero.', sizes:SIZES_SHOE, colors:[{n:'Mostaza',h:'#e0a12b'},{n:'Negro/Rojo',h:'#1a1a1d'},{n:'Blanco',h:'#eae7e0'}], stock:4, active:true, featured:false, position:6 },
  { id:'adidas-ultraboost',     brand:'Adidas',     name:'Ultraboost Light',       price:899900, sale_price:759900, tag:'Running', category:'Tenis', gender:'Unisex', shape:'s-low', shoe_color:'#22252c', bg:'#eaeaec', description:'Espuma Light BOOST y parte superior Primeknit.', sizes:SIZES_SHOE, colors:[{n:'Negro',h:'#22252c'},{n:'Blanco',h:'#e7e5e0'},{n:'Gris',h:'#8b8f96'}], stock:10, active:true, featured:false, position:7 },
  { id:'adidas-samba-og',       brand:'Adidas',     name:'Samba OG',               price:549900, tag:'Clásico',          category:'Tenis', gender:'Unisex', shape:'s-low',  shoe_color:'#17181c', bg:'#efece5', description:'Cuero, punta de gamuza y suela de goma color miel.', sizes:SIZES_SHOE, colors:[{n:'Negro',h:'#17181c'},{n:'Blanco/Verde',h:'#dedbd2'},{n:'Azul',h:'#26407a'}], stock:18, active:true, featured:true,  position:8 },
  { id:'adidas-forum-low',      brand:'Adidas',     name:'Forum Low',              price:499900, tag:'Calle',            category:'Tenis', gender:'Unisex', shape:'s-low',  shoe_color:'#dcd9d0', bg:'#eef1f3', description:'Cuero sintético, correa en el tobillo y suela de goma. Un básico de los 80.',                             sizes:SIZES_SHOE, colors:[{n:'Blanco/Azul',h:'#dcd9d0'},{n:'Negro',h:'#191b20'},{n:'Rosado',h:'#d98aa0'}], stock:9, active:true, featured:false, position:9 },
  { id:'adidas-gazelle',        brand:'Adidas',     name:'Gazelle Indoor',         price:589900, tag:'Retro',            category:'Tenis', gender:'Unisex', shape:'s-low',  shoe_color:'#2d4b8e', bg:'#e9edf5', description:'Gamuza con las tres bandas en contraste y suela de goma. Corte bajo y ajuste ceñido.',                    sizes:SIZES_SHOE, colors:[{n:'Azul',h:'#2d4b8e'},{n:'Rojo',h:'#a32030'},{n:'Beige',h:'#cbb392'}], stock:7, active:true, featured:false, position:10 },
  { id:'puma-suede-classic',      brand:'Puma',        name:'Suede Classic',         price:399900, category:'Tenis', gender:'Unisex', tag:'Clásico', shape:'s-low', shoe_color:'#1f3f8a', bg:'#e8edf7', description:'Parte superior en gamuza con franja lateral en contraste y suela de goma.', sizes:SIZES_SHOE, colors:[{n:'Azul',h:'#1f3f8a'},{n:'Negro',h:'#18191c'},{n:'Rojo',h:'#b3202c'}], stock:12, active:true, featured:true,  position:11 },
  { id:'puma-rs-x',               brand:'Puma',        name:'RS-X',                  price:539900, category:'Tenis', gender:'Unisex', tag:'Running', shape:'s-low', shoe_color:'#e9e6df', bg:'#eef0f3', description:'Suela gruesa con amortiguación RS y parte superior en malla y cuero sintético.', sizes:SIZES_SHOE, colors:[{n:'Blanco/Azul',h:'#e9e6df'},{n:'Negro',h:'#1b1c20'}], stock:8, active:true, featured:false, position:12 },
  { id:'new-balance-574',         brand:'New Balance', name:'574',                   price:489900, category:'Tenis', gender:'Unisex', tag:'Retro',   shape:'s-low', shoe_color:'#8b8f96', bg:'#eef0f2', description:'Gamuza y malla, entresuela de espuma y suela de goma.', sizes:SIZES_SHOE, colors:[{n:'Gris',h:'#8b8f96'},{n:'Azul marino',h:'#1d2b4a'}], stock:10, active:true, featured:false, position:13 },
  { id:'converse-chuck-70',       brand:'Converse',    name:'Chuck 70 Hi',           price:379900, category:'Tenis', gender:'Unisex', tag:'Caña alta', shape:'s-high', shoe_color:'#1a1a1c', bg:'#efede8', description:'Lona de caña alta con puntera de goma.', sizes:SIZES_SHOE, colors:[{n:'Negro',h:'#1a1a1c'},{n:'Crudo',h:'#e8e0cc'}], stock:14, active:true, featured:false, position:14 },
  { id:'vans-old-skool',          brand:'Vans',        name:'Old Skool',             price:329900, category:'Tenis', gender:'Unisex', tag:'Skate',   shape:'s-low', shoe_color:'#18191c', bg:'#efefef', description:'Lona y gamuza con franja lateral y suela waffle de goma.', sizes:SIZES_SHOE, colors:[{n:'Negro/Blanco',h:'#18191c'},{n:'Azul',h:'#1d2d5c'}], stock:16, active:true, featured:false, position:15 },
  { id:'sandalia-tiras-mujer',     brand:'Kairo Selección', name:'Sandalia de tiras',  price:129900, category:'Sandalias', gender:'Mujer',  tag:'Verano', shape:'s-sandal', shoe_color:'#c9a27e', bg:'#f6efe8', description:'Sandalia plana con tiras cruzadas y hebilla al tobillo.', sizes:SIZES_W, colors:[{n:'Camel',h:'#c9a27e'},{n:'Negro',h:'#1d1d1f'}], stock:10, active:true, featured:false, position:16 },
  { id:'chancla-hombre-clasica',   brand:'Kairo Selección', name:'Chancla clásica',    price:59900,  category:'Chanclas',  gender:'Hombre', tag:'Playa',  shape:'s-flip',   shoe_color:'#1f3b57', bg:'#e8f0f5', description:'Chancla de goma con suela antideslizante.', sizes:SIZES_FLIP, colors:[{n:'Azul',h:'#1f3b57'},{n:'Negro',h:'#18191c'}], stock:20, active:true, featured:false, position:17 },
  { id:'chancla-mujer-plataforma', brand:'Kairo Selección', name:'Chancla plataforma', price:79900,  category:'Chanclas',  gender:'Mujer',  tag:'Playa',  shape:'s-flip',   shoe_color:'#e3a6b4', bg:'#f8ecef', description:'Chancla con suela gruesa y tira suave.', sizes:SIZES_W, colors:[{n:'Rosado',h:'#e3a6b4'},{n:'Blanco',h:'#ece9e2'}], stock:15, active:true, featured:false, position:18 }
];

const PROMOS = [
  { id:'promo-envio',   title:'Envío gratis desde $600.000', description:'Pedidos superiores a $600.000 enviados sin costo a toda Colombia.', badge:'Envío gratis', discount:0, scope:'Todos', active:false, position:1 },
  { id:'promo-segunda', title:'Segunda unidad al 30% off',   description:'Llevando dos pares de cualquier marca, el segundo sale con 30% de descuento.', badge:'2x ahorro', discount:30, scope:'Todos', active:false, position:2 }
];

async function run() {
  console.log('Cargando productos...');
  const { error: pe } = await supabase.from('products').upsert(PRODUCTS, { onConflict: 'id' });
  if (pe) { console.error('Error productos:', pe.message); process.exit(1); }
  console.log(`  ✓ ${PRODUCTS.length} productos insertados`);

  console.log('Cargando promociones...');
  const { error: me } = await supabase.from('promos').upsert(PROMOS, { onConflict: 'id' });
  if (me) { console.error('Error promos:', me.message); process.exit(1); }
  console.log(`  ✓ ${PROMOS.length} promociones insertadas`);

  console.log('\n¡Listo! Abre el panel de admin y verás todos los productos.');
  process.exit(0);
}
run();
