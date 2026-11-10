'use strict';
/* =====================================================================
   Barrios de Quibdó por comuna (lista inicial para domicilios).
   Fuente: listado de grupos de valor de la Alcaldía de Quibdó
   (quibdo-choco.gov.co) y la división en 6 comunas de Wikipedia.
   Distancia por defecto (se cambia en Panel → Ajustes → Domicilios):
   - Comuna 3 (Anillo Central) → cerca
   - Comunas 1, 2, 4 y 5        → distancia media
   - Comuna 6 (Jardín, Zona Minera) → lejos
   ===================================================================== */
const POR_COMUNA = {
  1: [ // Zona Norte
    'Futuro 1', 'Villa España', 'Casa Blanca', 'La Victoria 2', 'La Unión', 'La Gloria', 'La Fe',
    'Obrero Central', 'Obrero Zarabanda', 'Obrero Las Brisas', 'Obrero Villa Hermosa', 'Santa Elena',
    'Reposo 1', 'Reposo 2', 'Dos de Mayo', 'Buenos Aires Parte Alta', 'Buenos Aires Parte Baja',
    'Libertad Mis Esfuerzos', 'Mis Esfuerzos', 'Subestación', 'Monserrate', 'Álamos', 'Álamos Arrocera',
    'La Paz', 'San José', 'Miraflores', 'Kennedy Central', 'Kennedy Arenal', 'Kennedy Venecia',
    'Kennedy Cantonera', 'La Esperanza'
  ],
  2: [ // Porvenir y Platina
    'Porvenir', 'El Paraíso', 'Piñal Colina', 'Santo Domingo de Guzmán', 'Santo Domingo Santa Cruz',
    'Los Ángeles Centro', 'Los Ángeles Sector Condoto', 'El Bosque', 'Bosque de la Platina',
    'Caraño Parte Baja', 'Caraño Parte Alta', 'Caraño Piñal', 'Conquistadores', 'Cohimbra', 'Esmeralda',
    'Julio Figueroa Villa', 'Fuego Verde', 'Santa Ana Parte Baja', 'Santa Ana Parte Alta',
    'Santa Ana Sector 3', 'San Judas Tadeo', 'San Judas Colina', 'Vista Hermosa', 'Villa Socorro',
    'Virgen del Carmen', 'Tomás Pérez', 'Las Américas'
  ],
  3: [ // Anillo Central
    'Centro', 'Yesca Grande', 'Yesquita', 'Yesquita Sector La 22', 'El Silencio', 'García Gómez',
    'García Gómez Primavera', 'Chamblún Novena', 'Chamblún Venecia', 'Calle de las Águilas',
    'Avenida Bahía Solano', 'Pandeyuca', 'Alameda Reyes', 'Alameda Sector Los Guaduales', 'Cristo Rey',
    'Roma', 'César Conto', 'Chambacú'
  ],
  4: [ // San Vicente y Niño Jesús
    'San Vicente Central', 'San Vicente La Quinta', 'Palenque Central', 'Palenque Avenida Río',
    'Niño Jesús Central', 'Niño Jesús Divino Niño', 'Niño Jesús Cabí', 'Niño Jesús La T',
    'Niño Jesús Boca de Cabí', 'Robledo', 'San Martín', 'San Martín Santa Helena', 'Valencia',
    'Pablo Sexto', 'La Paloma'
  ],
  5: [ // Medrano y Zona Sur
    'La Playita', 'Las Mercedes', 'Las Mercedes Sector La Cancha', 'Horizonte Parte Alta',
    'Horizonte Parte Baja', 'Simón Bolívar', 'Puente de Cabí', 'Nicolás Medrano Central',
    'Nicolás Medrano Santo Ecce Homo', 'Medrano Piñal', 'Medrano El Progreso', 'Medrano Viento Libre',
    'San Francisco de Medrano', 'Cascorba 17 de Octubre', 'La Cascorba', 'Alfonso López', 'La Aurora',
    'El Desafío', 'Las Palmas'
  ],
  6: [ // Jardín
    'Jardín Central', 'Jardín Rosales', 'Jardín Jazmín', 'Jardín Sector Las Dalias', 'Las Margaritas',
    'Poblado Las Brisas', 'Zona Minera Girasoles', 'Zona Minera La Victoria', 'Zona Minera Suba',
    'Zona Minera Los Castillo', 'Obapo', 'Flores de Buenaños', 'Minuto de Dios', 'Primavera Flor de Mayo',
    'Villa del Carmen', 'Montebello', 'Uribe Vélez Parte Baja', 'Uribe Vélez Parte Alta'
  ]
};

const ZONA_POR_COMUNA = { 1: 'media', 2: 'media', 3: 'cerca', 4: 'media', 5: 'media', 6: 'lejos' };

const BARRIOS_QUIBDO = Object.keys(POR_COMUNA).flatMap(c =>
  POR_COMUNA[c].map(nombre => ({ nombre, zona: ZONA_POR_COMUNA[c] })));

module.exports = { BARRIOS_QUIBDO, POR_COMUNA };
