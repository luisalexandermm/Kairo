#!/usr/bin/env node
/**
 * Carga los productos y promociones de ejemplo (incluye sandalias y chanclas) en Supabase.
 * Úsalo UNA sola vez después de crear las tablas:
 *   node lib/seed-db.js
 *
 * Necesita el archivo .env con SUPABASE_URL y SUPABASE_SERVICE_KEY.
 */
require('./env');
const supabase = require('./supabase');

const SIZES_SHOE = [34,35,36,37,38,39,40,41,42,43,44];
const SIZES_BOOT = [37,38,39,40,41,42,43,44];

const PRODUCTS = [
  { id:'nike-air-max-270',      brand:'Nike',       name:'Air Max 270',            price:749900, category:'Tenis', gender:'Hombre', tag:'Lifestyle',        shape:'s-low',  shoe_color:'#1d2733', bg:'#f3ece3', description:'Unidad Air de 32 mm en el talón, la más alta de la línea. Malla transpirable y horma fiel a la talla.',       sizes:SIZES_SHOE, colors:[{n:'Negro/Rojo',h:'#1d2733'},{n:'Blanco',h:'#e9e6df'},{n:'Azul',h:'#1d4ed8'}], stock:12, active:true, featured:true,  position:1 },
  { id:'nike-air-force-1',      brand:'Nike',       name:"Air Force 1 '07",        price:529900, category:'Tenis', gender:'Unisex', tag:'Clásico',          shape:'s-low',  shoe_color:'#e4e1d8', bg:'#eef0f2', description:'El clásico de cuero de 1982. Suela de goma con pivote y amortiguación Air en la entresuela.',              sizes:SIZES_SHOE, colors:[{n:'Blanco',h:'#e4e1d8'},{n:'Negro',h:'#171a1f'},{n:'Crema',h:'#d8c9ad'}],         stock:20, active:true, featured:false, position:2 },
  { id:'nike-pegasus-41',       brand:'Nike',       name:'Air Zoom Pegasus 41',    price:669900, sale_price:599900, category:'Tenis', gender:'Hombre', tag:'Running', shape:'s-low', shoe_color:'#2f6f8f', bg:'#e7f0f4', description:'Espuma ReactX y dos unidades Zoom Air para entrenamientos diarios y salidas largas.', sizes:SIZES_SHOE, colors:[{n:'Azul',h:'#2f6f8f'},{n:'Negro',h:'#1a1d22'},{n:'Verde',h:'#3f7d4c'}], stock:8, active:true, featured:false, position:3 },
  { id:'jordan-1-mid',          brand:'Jordan',     name:'Air Jordan 1 Mid',       price:759900, category:'Tenis', gender:'Unisex', tag:'Icono',            shape:'s-high', shoe_color:'#a4123a', bg:'#f1e7ea', description:'Caña media con cuello acolchado, cuero en el empeine y unidad Air encapsulada. Talla fiel.',              sizes:SIZES_SHOE, colors:[{n:'Rojo/Blanco',h:'#a4123a'},{n:'Negro',h:'#16181d'},{n:'Verde',h:'#1f5c3d'},{n:'Amarillo',h:'#d9a021'}], stock:15, active:true, featured:true, position:4 },
  { id:'jordan-1-zoom-cmft',    brand:'Jordan',     name:'Air Jordan 1 Zoom Cmft', price:849900, category:'Tenis', gender:'Hombre', tag:'Comodidad',        shape:'s-high', shoe_color:'#5b6470', bg:'#eceef0', description:'La silueta original con amortiguación Zoom de perfil bajo y cuello acolchado que sujeta el talón.',       sizes:SIZES_SHOE, colors:[{n:'Gris/Rojo',h:'#5b6470'},{n:'Blanco',h:'#e5e2da'},{n:'Morado',h:'#4b2e83'}], stock:6, active:true, featured:false, position:5 },
  { id:'jordan-retro-high-og',  brand:'Jordan',     name:'Air Jordan 1 Retro High OG', price:1179900, category:'Tenis', gender:'Unisex', tag:'Edición limitada', shape:'s-high', shoe_color:'#e0a12b', bg:'#f6eee0', description:'Corte alto en cuero premium, construcción fiel al modelo de 1985.', sizes:SIZES_SHOE, colors:[{n:'Mostaza',h:'#e0a12b'},{n:'Negro/Rojo',h:'#1a1a1d'},{n:'Blanco',h:'#eae7e0'}], stock:4, active:true, featured:false, position:6 },
  { id:'adidas-ultraboost',     brand:'Adidas',     name:'Ultraboost Light',       price:899900, sale_price:759900, category:'Tenis', gender:'Mujer', tag:'Running', shape:'s-low', shoe_color:'#22252c', bg:'#eaeaec', description:'Espuma Light BOOST, 30% más liviana. Upper Primeknit que se ajusta al pie.', sizes:SIZES_SHOE, colors:[{n:'Negro',h:'#22252c'},{n:'Blanco',h:'#e7e5e0'},{n:'Gris',h:'#8b8f96'}], stock:10, active:true, featured:false, position:7 },
  { id:'adidas-samba-og',       brand:'Adidas',     name:'Samba OG',               price:549900, category:'Tenis', gender:'Unisex', tag:'Clásico',          shape:'s-low',  shoe_color:'#17181c', bg:'#efece5', description:'Cuero suave, punta de gamuza y suela de goma color miel. La silueta baja más versátil del momento.', sizes:SIZES_SHOE, colors:[{n:'Negro',h:'#17181c'},{n:'Blanco/Verde',h:'#dedbd2'},{n:'Azul',h:'#26407a'}], stock:18, active:true, featured:true,  position:8 },
  { id:'adidas-forum-low',      brand:'Adidas',     name:'Forum Low',              price:499900, category:'Tenis', gender:'Mujer', tag:'Calle',            shape:'s-low',  shoe_color:'#dcd9d0', bg:'#eef1f3', description:'Cuero sintético, correa en el tobillo y suela de goma. Un básico de los 80.',                             sizes:SIZES_SHOE, colors:[{n:'Blanco/Azul',h:'#dcd9d0'},{n:'Negro',h:'#191b20'},{n:'Rosado',h:'#d98aa0'}], stock:9, active:true, featured:false, position:9 },
  { id:'adidas-gazelle',        brand:'Adidas',     name:'Gazelle Indoor',         price:589900, category:'Tenis', gender:'Mujer', tag:'Retro',            shape:'s-low',  shoe_color:'#2d4b8e', bg:'#e9edf5', description:'Gamuza con las tres bandas en contraste y suela de goma. Corte bajo y ajuste ceñido.',                    sizes:SIZES_SHOE, colors:[{n:'Azul',h:'#2d4b8e'},{n:'Rojo',h:'#a32030'},{n:'Beige',h:'#cbb392'}], stock:7, active:true, featured:false, position:10 },
  { id:'puma-suede-classic',    brand:'Puma',        name:'Suede Classic XXI',     price:429900, tag:'Clásico',  category:'Tenis', gender:'Unisex', shape:'s-low', shoe_color:'#1f3f8a', bg:'#e8edf6', description:'Gamuza suave, franja Formstrip lateral y suela de goma. Un básico de calle desde 1968.', sizes:SIZES_SHOE, colors:[{n:'Azul',h:'#1f3f8a'},{n:'Negro',h:'#1a1a1d'},{n:'Rojo',h:'#a32030'}], stock:10, active:true, featured:false, position:11 },
  { id:'puma-rs-x',             brand:'Puma',        name:'RS-X Efekt',            price:569900, tag:'Chunky',   category:'Tenis', gender:'Hombre', shape:'s-low', shoe_color:'#e3e0d8', bg:'#eef0f2', description:'Suela robusta con amortiguación RS y capas de malla y cuero sintético.', sizes:SIZES_SHOE, colors:[{n:'Blanco/Gris',h:'#e3e0d8'},{n:'Negro',h:'#1c1d21'}], stock:8, active:true, featured:false, position:12 },
  { id:'new-balance-574',       brand:'New Balance', name:'574 Core',              price:539900, tag:'Retro',    category:'Tenis', gender:'Unisex', shape:'s-low', shoe_color:'#7d8590', bg:'#ecedef', description:'Gamuza y malla, entresuela ENCAP para soporte y amortiguación todo el día.', sizes:SIZES_SHOE, colors:[{n:'Gris',h:'#7d8590'},{n:'Azul marino',h:'#1f2a44'},{n:'Verde',h:'#3d5a40'}], stock:9, active:true, featured:true, position:13 },
  { id:'converse-chuck-70-hi',  brand:'Converse',    name:'Chuck 70 Hi',           price:389900, tag:'Icono',    category:'Tenis', gender:'Unisex', shape:'s-high', shoe_color:'#151515', bg:'#efece5', description:'Lona gruesa, puntera de goma brillante y plantilla acolchada. Caña alta.', sizes:SIZES_SHOE, colors:[{n:'Negro',h:'#151515'},{n:'Hueso',h:'#e8e1cf'},{n:'Rojo',h:'#a3141f'}], stock:14, active:true, featured:false, position:14 },
  { id:'vans-old-skool',        brand:'Vans',        name:'Old Skool',             price:349900, tag:'Skate',    category:'Tenis', gender:'Unisex', shape:'s-low', shoe_color:'#18191c', bg:'#eceae6', description:'Lona y gamuza con la franja lateral Sidestripe y suela waffle de goma.', sizes:SIZES_SHOE, colors:[{n:'Negro/Blanco',h:'#18191c'},{n:'Azul marino',h:'#1d2846'}], stock:16, active:true, featured:false, position:15 },
  { id:'nike-calm-sandal-w',    brand:'Nike',        name:'Calm Sandal',           price:249900, tag:'Verano',   category:'Sandalias', gender:'Mujer', shape:'s-low', shoe_color:'#d9b8a6', bg:'#f6ece6', description:'Sandalia de espuma con correa ajustable en el tobillo. Liviana y fácil de limpiar.', sizes:[35,36,37,38,39,40], colors:[{n:'Rosa arena',h:'#d9b8a6'},{n:'Negro',h:'#1b1b1d'}], stock:12, active:true, featured:true, position:16 },
  { id:'adidas-adilette-comfort', brand:'Adidas',    name:'Adilette Comfort',      price:169900, tag:'Comodidad', category:'Chanclas', gender:'Unisex', shape:'s-low', shoe_color:'#1d2a3d', bg:'#e9edf3', description:'Chancla con plantilla Cloudfoam y las tres bandas en la tira.', sizes:[36,37,38,39,40,41,42,43,44], colors:[{n:'Azul marino',h:'#1d2a3d'},{n:'Negro',h:'#18181b'}], stock:20, active:true, featured:false, position:17 },
  { id:'nike-victori-one-h',    brand:'Nike',        name:'Victori One Slide',     price:179900, tag:'Casa y playa', category:'Chanclas', gender:'Hombre', shape:'s-low', shoe_color:'#232428', bg:'#ecedef', description:'Espuma suave con textura en la plantilla y tira acolchada.', sizes:[38,39,40,41,42,43,44], colors:[{n:'Negro',h:'#232428'},{n:'Gris',h:'#8c9097'}], stock:15, active:true, featured:false, position:18 },
  { id:'puma-mayze-w',          brand:'Puma',        name:'Mayze Stack Sandal',    price:279900, tag:'Plataforma', category:'Sandalias', gender:'Mujer', shape:'s-low', shoe_color:'#ece6da', bg:'#f4efe6', description:'Sandalia con plataforma de 4 cm y correas acolchadas.', sizes:[35,36,37,38,39,40], colors:[{n:'Crema',h:'#ece6da'},{n:'Negro',h:'#1a1a1c'}], stock:7, active:true, featured:false, position:19 }
];

// Las promociones de ejemplo se cargan INACTIVAS: actívalas desde el panel cuando quieras usarlas.
const PROMOS = [
  { id:'promo-envio', title:'Envío gratis desde $600.000', description:'Pedidos con productos desde $600.000 se envían sin costo a toda Colombia.', badge:'Envío gratis', kind:'envio', discount:0, min_subtotal:600000, scope_type:'todo', conditions:'Aplica para pedidos con subtotal de productos desde $600.000 después de descuentos. Válido en toda Colombia mientras la promoción esté activa.', active:false, position:1 },
  { id:'promo-sandalias', title:'Sandalias 15% off', description:'Todas las sandalias con 15% de descuento.', badge:'-15%', kind:'descuento', discount:15, scope_type:'categoria', scope_value:'Sandalias', conditions:'Descuento del 15% sobre el precio normal de las sandalias. No acumulable con otras promociones de descuento del mismo producto.', active:false, position:2 }
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
