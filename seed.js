'use strict';
/** Datos iniciales: se cargan la primera vez que arrancas el servidor. */

const SIZES_SHOE = [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44];
const SIZES_BOOT = [37, 38, 39, 40, 41, 42, 43, 44];

const products = [
  { id:'nike-air-max-270', brand:'Nike', name:'Air Max 270', price:749900, salePrice:null, tag:'Lifestyle', shape:'s-low', shoeColor:'#1d2733', bg:'#f3ece3', image:'', desc:'Unidad Air de 32 mm en el talón, la más alta de la línea. Malla transpirable y horma fiel a la talla.', sizes:SIZES_SHOE, colors:[{n:'Negro/Rojo',h:'#1d2733'},{n:'Blanco',h:'#e9e6df'},{n:'Azul',h:'#1d4ed8'}], stock:12, active:true, featured:true, position:1 },
  { id:'nike-air-force-1', brand:'Nike', name:"Air Force 1 '07", price:529900, salePrice:null, tag:'Clásico', shape:'s-low', shoeColor:'#e4e1d8', bg:'#eef0f2', image:'', desc:'El clásico de cuero de 1982. Suela de goma con pivote y amortiguación Air en la entresuela.', sizes:SIZES_SHOE, colors:[{n:'Blanco',h:'#e4e1d8'},{n:'Negro',h:'#171a1f'},{n:'Crema',h:'#d8c9ad'}], stock:20, active:true, featured:false, position:2 },
  { id:'nike-pegasus-41', brand:'Nike', name:'Air Zoom Pegasus 41', price:669900, salePrice:599900, tag:'Running', shape:'s-low', shoeColor:'#2f6f8f', bg:'#e7f0f4', image:'', desc:'Espuma ReactX y dos unidades Zoom Air para entrenamientos diarios y salidas largas.', sizes:SIZES_SHOE, colors:[{n:'Azul',h:'#2f6f8f'},{n:'Negro',h:'#1a1d22'},{n:'Verde',h:'#3f7d4c'}], stock:8, active:true, featured:false, position:3 },
  { id:'jordan-1-mid', brand:'Jordan', name:'Air Jordan 1 Mid', price:759900, salePrice:null, tag:'Icono', shape:'s-high', shoeColor:'#a4123a', bg:'#f1e7ea', image:'', desc:'Caña media con cuello acolchado, cuero en el empeine y unidad Air encapsulada. Talla fiel.', sizes:SIZES_SHOE, colors:[{n:'Rojo/Blanco',h:'#a4123a'},{n:'Negro',h:'#16181d'},{n:'Verde',h:'#1f5c3d'},{n:'Amarillo',h:'#d9a021'}], stock:15, active:true, featured:true, position:4 },
  { id:'jordan-1-zoom-cmft', brand:'Jordan', name:'Air Jordan 1 Zoom Cmft', price:849900, salePrice:null, tag:'Comodidad', shape:'s-high', shoeColor:'#5b6470', bg:'#eceef0', image:'', desc:'La silueta original con amortiguación Zoom de perfil bajo y cuello acolchado que sujeta el talón.', sizes:SIZES_SHOE, colors:[{n:'Gris/Rojo',h:'#5b6470'},{n:'Blanco',h:'#e5e2da'},{n:'Morado',h:'#4b2e83'}], stock:6, active:true, featured:false, position:5 },
  { id:'jordan-retro-high-og', brand:'Jordan', name:'Air Jordan 1 Retro High OG', price:1179900, salePrice:null, tag:'Edición limitada', shape:'s-high', shoeColor:'#e0a12b', bg:'#f6eee0', image:'', desc:'Corte alto en cuero premium, construcción fiel al modelo de 1985. Unidades limitadas por talla.', sizes:SIZES_SHOE, colors:[{n:'Mostaza',h:'#e0a12b'},{n:'Negro/Rojo',h:'#1a1a1d'},{n:'Blanco',h:'#eae7e0'}], stock:4, active:true, featured:false, position:6 },
  { id:'adidas-ultraboost', brand:'Adidas', name:'Ultraboost Light', price:899900, salePrice:759900, tag:'Running', shape:'s-low', shoeColor:'#22252c', bg:'#eaeaec', image:'', desc:'Espuma Light BOOST, 30% más liviana que la anterior. Upper Primeknit que se ajusta al pie.', sizes:SIZES_SHOE, colors:[{n:'Negro',h:'#22252c'},{n:'Blanco',h:'#e7e5e0'},{n:'Gris',h:'#8b8f96'}], stock:10, active:true, featured:false, position:7 },
  { id:'adidas-samba-og', brand:'Adidas', name:'Samba OG', price:549900, salePrice:null, tag:'Clásico', shape:'s-low', shoeColor:'#17181c', bg:'#efece5', image:'', desc:'Cuero suave, punta de gamuza y suela de goma color miel. La silueta baja más versátil del momento.', sizes:SIZES_SHOE, colors:[{n:'Negro',h:'#17181c'},{n:'Blanco/Verde',h:'#dedbd2'},{n:'Azul',h:'#26407a'}], stock:18, active:true, featured:true, position:8 },
  { id:'adidas-forum-low', brand:'Adidas', name:'Forum Low', price:499900, salePrice:null, tag:'Calle', shape:'s-low', shoeColor:'#dcd9d0', bg:'#eef1f3', image:'', desc:'Cuero sintético, correa en el tobillo y suela de goma con estampado. Un básico de los 80.', sizes:SIZES_SHOE, colors:[{n:'Blanco/Azul',h:'#dcd9d0'},{n:'Negro',h:'#191b20'},{n:'Rosado',h:'#d98aa0'}], stock:9, active:true, featured:false, position:9 },
  { id:'adidas-gazelle', brand:'Adidas', name:'Gazelle Indoor', price:589900, salePrice:null, tag:'Retro', shape:'s-low', shoeColor:'#2d4b8e', bg:'#e9edf5', image:'', desc:'Gamuza con las tres bandas en contraste y suela de goma. Corte bajo y ajuste ceñido.', sizes:SIZES_SHOE, colors:[{n:'Azul',h:'#2d4b8e'},{n:'Rojo',h:'#a32030'},{n:'Beige',h:'#cbb392'}], stock:7, active:true, featured:false, position:10 },
  { id:'timberland-6-inch', brand:'Timberland', name:'Bota 6-Inch Premium', price:1099900, salePrice:null, tag:'Impermeable', shape:'s-boot', shoeColor:'#b47a29', bg:'#f3ebdd', image:'', desc:'Nobuk impermeable, costuras selladas y forro acolchado. La bota amarilla original de Nueva York.', sizes:SIZES_BOOT, colors:[{n:'Trigo',h:'#b47a29'},{n:'Negro',h:'#22201d'},{n:'Café',h:'#6b4423'}], stock:5, active:true, featured:true, position:11 },
  { id:'timberland-euro-sprint', brand:'Timberland', name:'Euro Sprint Hiker', price:879900, salePrice:null, tag:'Outdoor', shape:'s-boot', shoeColor:'#5a4630', bg:'#efe9e0', image:'', desc:'Bota de caña media en nobuk, suela con tracción profunda y plantilla Anti-Fatigue.', sizes:SIZES_BOOT, colors:[{n:'Café',h:'#5a4630'},{n:'Negro',h:'#26241f'},{n:'Trigo',h:'#c08c3c'}], stock:6, active:true, featured:false, position:12 }
];

const promos = [
  { id:'promo-1', title:'Segunda unidad al 30%', description:'Llevando dos pares de cualquier marca, el segundo sale con 30% de descuento.', badge:'2x1 parcial', discount:30, scope:'Todos', active:true, position:1 },
  { id:'promo-2', title:'Envío gratis desde $600.000', description:'Pedidos superiores a $600.000 con envío sin costo a toda Colombia.', badge:'Envío gratis', discount:0, scope:'Todos', active:true, position:2 }
];

const settings = {
  id:'app',
  storeName:'kAIRO',
  tagline:'Sneaker Store',
  whatsapp:'573145312045',
  heroWord:'SNEAKERS',
  heroTheme:'indigo',
  heroLogo:'',
  heroHeadline:'Nike · Jordan · Adidas · Timberland',
  shippingNote:'Envíos a toda Colombia · 2 a 5 días hábiles',
  adminPassword:'12345'
};

module.exports = { products, promos, settings };
