/*
==========================================================
RMG PARTS
MOCK DATA
==========================================================
*/

const MOCK_CATEGORIES=[

{
id:1,
name:"Neumáticos",
icon:"tire"
},

{
id:2,
name:"Baterías",
icon:"battery"
},

{
id:3,
name:"Aceites",
icon:"oil"
},

{
id:4,
name:"Lubricantes",
icon:"lubricant"
},

{
id:5,
name:"Grasas",
icon:"grease"
},

{
id:6,
name:"Refrigerantes",
icon:"coolant"
}

];

const MOCK_BRANDS=[

"Kumho",
"Michelin",
"Bridgestone",
"Shell",
"Mobil",
"Vistony",
"Total",
"Bosch",
"Platin",
"ACDelco"

];

const MOCK_PRODUCTS=[

{
id:1,
sku:"NEU001",
nombre:"Neumático Kumho 195/65R15",
marca:"Kumho",
categoria:"Neumáticos",
precio:58990,
stock:18,
imagen:"",
destacado:true,
descripcion:"Neumático para automóvil."
},

{
id:2,
sku:"BAT001",
nombre:"Batería Bosch 70Ah",
marca:"Bosch",
categoria:"Baterías",
precio:104990,
stock:9,
imagen:"",
destacado:true,
descripcion:"Batería libre de mantenimiento."
},

{
id:3,
sku:"ACE001",
nombre:"Shell Helix HX7 5W30",
marca:"Shell",
categoria:"Aceites",
precio:23990,
stock:42,
imagen:"",
destacado:true,
descripcion:"Aceite sintético."
},

{
id:4,
sku:"ACE002",
nombre:"Mobil Super 3000",
marca:"Mobil",
categoria:"Aceites",
precio:27990,
stock:14,
imagen:"",
destacado:false,
descripcion:"Aceite premium."
},

{
id:5,
sku:"BAT002",
nombre:"Platin 90Ah",
marca:"Platin",
categoria:"Baterías",
precio:124990,
stock:4,
imagen:"",
destacado:true,
descripcion:"Batería para maquinaria."
},

{
id:6,
sku:"NEU002",
nombre:"Michelin LTX",
marca:"Michelin",
categoria:"Neumáticos",
precio:148990,
stock:12,
imagen:"",
destacado:false,
descripcion:"Neumático SUV."
}

];

/*
==========================================================
UTILIDADES MOCK
==========================================================
*/

const MockDB={

getProducts(){

return [...MOCK_PRODUCTS];

},

getCategories(){

return [...MOCK_CATEGORIES];

},

getBrands(){

return [...MOCK_BRANDS];

},

search(text){

text=text.toLowerCase();

return MOCK_PRODUCTS.filter(p=>

p.nombre.toLowerCase().includes(text) ||

p.sku.toLowerCase().includes(text) ||

p.marca.toLowerCase().includes(text) ||

p.categoria.toLowerCase().includes(text)

);

}

};

console.log("MOCK DATA OK");
