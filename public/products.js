// ============================================================
// products.js — Base de datos de productos
// ============================================================
// Aquí vivem TODOS los productos del catálogo.
// Es un array (lista) de objetos. Cada objeto = 1 producto.
// Cuando quieras agregar un producto nuevo, simplemente
// copiás uno de estos bloques y cambiás los valores.
// ============================================================

const products = [

  // ----------------------------------------------------------
  // Cada producto es un objeto { clave: valor, clave: valor }
  // Las claves son siempre las mismas para todos los productos
  // ----------------------------------------------------------

  {
    id: 1,                          // Número único que identifica al producto
    name: "Aceite de Motor 10W-40", // Nombre que se muestra en la tarjeta
    price: 25000,                   // Precio en tu moneda local (número, sin símbolos)
    category: "aceites",            // Categoría en MINÚSCULAS y sin tildes (para filtrar)
    image: "https://placehold.co/300x300?text=Aceite+10W-40", // URL de la imagen
    description: "Aceite mineral para motores nafteros y diésel. Protección ante altas temperaturas y desgaste prolongado. Presentación de 1 litro.",
    whatsapp: "000"                 // Número de WhatsApp SIN el + ni espacios
  },

  {
    id: 2,
    name: "Aceite Sintético 5W-30",
    price: 42000,
    category: "aceites",
    image: "https://placehold.co/300x300?text=Aceite+5W-30",
    description: "Aceite 100% sintético de alto rendimiento. Ideal para motores modernos con turbo. Mayor durabilidad y menor consumo.",
    whatsapp: "000"
  },

  {
    id: 3,
    name: "Bandeja de Plástico Grande",
    price: 8500,
    category: "plasticos",
    image: "https://placehold.co/300x300?text=Bandeja+Grande",
    description: "Bandeja plástica resistente de 40x60cm. Material polipropileno de alta densidad. Apta para uso alimentario.",
    whatsapp: "000"
  },

  {
    id: 4,
    name: "Contenedor Hermético 2L",
    price: 12000,
    category: "plasticos",
    image: "https://placehold.co/300x300?text=Contenedor+2L",
    description: "Contenedor plástico con tapa hermética de 2 litros. Sin BPA. Apto para microondas y lavavajillas.",
    whatsapp: "000"
  },

  {
    id: 5,
    name: "Arduino Uno R3",
    price: 85000,
    category: "electronica",
    image: "https://placehold.co/300x300?text=Arduino+Uno",
    description: "Placa de desarrollo Arduino Uno R3 original. Microcontrolador ATmega328P. Ideal para proyectos de electrónica y robótica.",
    whatsapp: "000"
  },

  {
    id: 6,
    name: "Raspberry Pi 4 - 4GB",
    price: 320000,
    category: "electronica",
    image: "https://placehold.co/300x300?text=Raspberry+Pi+4",
    description: "Computadora de placa única Raspberry Pi 4 con 4GB de RAM. Procesador ARM Cortex-A72. Ideal para proyectos IoT y media centers.",
    whatsapp: "000"
  },

  {
    id: 7,
    name: "Bombilla LED 9W",
    price: 4500,
    category: "iluminacion",
    image: "https://placehold.co/300x300?text=LED+9W",
    description: "Bombilla LED de 9W equivalente a 60W incandescente. Luz cálida 3000K. Vida útil de 25.000 horas.",
    whatsapp: "000"
  },

  {
    id: 8,
    name: "Reflector LED 50W",
    price: 38000,
    category: "iluminacion",
    image: "https://placehold.co/300x300?text=Reflector+50W",
    description: "Reflector LED de exterior de 50W. IP65 resistente al agua. Luz fría 6500K. Ideal para depósitos y canchas.",
    whatsapp: "000"
  },

  {
    id: 9,
    name: "Aceite de Transmisión 80W-90",
    price: 31000,
    category: "aceites",
    image: "https://placehold.co/300x300?text=Aceite+80W-90",
    description: "Aceite para cajas manuales y diferenciales. Formulación mineral de alto rendimiento. Presentación de 1 litro.",
    whatsapp: "000"
  },

  {
    id: 10,
    name: "Caja de Herramientas Plástica",
    price: 22000,
    category: "plasticos",
    image: "https://placehold.co/300x300?text=Caja+Herramientas",
    description: "Caja organizadora de plástico con compartimentos variables. Medidas 35x20x8cm. Con cierre de seguridad.",
    whatsapp: "000"
  },

  {
    id: 11,
    name: "Tira LED RGB 5m",
    price: 55000,
    category: "iluminacion",
    image: "https://placehold.co/300x300?text=Tira+LED+RGB",
    description: "Tira LED RGB de 5 metros con control remoto. 300 LEDs por tira. Adhesivo 3M incluido. 12V DC.",
    whatsapp: "000"
  },

  {
    id: 12,
    name: "Módulo ESP32 WiFi+Bluetooth",
    price: 45000,
    category: "electronica",
    image: "https://placehold.co/300x300?text=ESP32",
    description: "Módulo ESP32 con WiFi y Bluetooth integrados. 38 pines. Compatible con Arduino IDE. Ideal para proyectos IoT.",
    whatsapp: "000"
  }

];

// ============================================================
// ¿Por qué usamos const y no var o let?
// - const = el array "products" no se va a reasignar
// - var = viejo, evitamos usarlo en código moderno
// - let = para valores que SÍ van a cambiar (contadores, etc.)
// ============================================================
