export type CategoryType = 'Fijo' | 'Variable';

export interface DefaultCategory {
  id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  children?: Omit<DefaultCategory, 'type' | 'icon' | 'color' | 'children'>[];
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    id: 'cat_alimentacion', name: 'Alimentación', type: 'Variable', icon: 'utensils', color: '#FF6B6B',
    children: [
      { id: 'cat_supermercado', name: 'Supermercado' },
      { id: 'cat_delivery', name: 'Delivery' },
      { id: 'cat_almacen', name: 'Almacén / Kiosco' },
    ],
  },
  {
    id: 'cat_gastronomia', name: 'Gastronomía', type: 'Variable', icon: 'wine-glass', color: '#FFA500',
    children: [
      { id: 'cat_restaurant', name: 'Restaurant' },
      { id: 'cat_cafe', name: 'Café' },
      { id: 'cat_bar', name: 'Bar' },
    ],
  },
  {
    id: 'cat_transporte', name: 'Transporte', type: 'Variable', icon: 'car', color: '#4ECDC4',
    children: [
      { id: 'cat_combustible', name: 'Combustible' },
      { id: 'cat_peajes', name: 'Peajes' },
      { id: 'cat_rideshare', name: 'Uber / Taxi' },
      { id: 'cat_estacionamiento', name: 'Estacionamiento' },
      { id: 'cat_ferry', name: 'Ferry / Buquebus' },
    ],
  },
  {
    id: 'cat_hogar', name: 'Hogar', type: 'Fijo', icon: 'home', color: '#95E1D3',
    children: [
      { id: 'cat_electricidad', name: 'Electricidad' },
      { id: 'cat_gas', name: 'Gas' },
      { id: 'cat_agua', name: 'Agua' },
      { id: 'cat_internet', name: 'Internet / Cable' },
      { id: 'cat_mantenimiento', name: 'Mantenimiento' },
      { id: 'cat_alquiler', name: 'Alquiler' },
      { id: 'cat_expensas', name: 'Expensas' },
    ],
  },
  {
    id: 'cat_salud', name: 'Salud', type: 'Fijo', icon: 'heart-pulse', color: '#E74C3C',
    children: [
      { id: 'cat_prepaga', name: 'Prepaga / Obra Social' },
      { id: 'cat_farmacia', name: 'Farmacia' },
      { id: 'cat_medico', name: 'Consultas Médicas' },
    ],
  },
  {
    id: 'cat_educacion', name: 'Educación', type: 'Fijo', icon: 'graduation-cap', color: '#3498DB',
    children: [
      { id: 'cat_colegio', name: 'Colegio / Universidad' },
      { id: 'cat_cursos', name: 'Cursos / Capacitación' },
      { id: 'cat_materiales', name: 'Materiales' },
    ],
  },
  {
    id: 'cat_entretenimiento', name: 'Entretenimiento', type: 'Variable', icon: 'gamepad', color: '#9B59B6',
    children: [
      { id: 'cat_cine', name: 'Cine / Teatro' },
      { id: 'cat_streaming', name: 'Streaming' },
      { id: 'cat_deportes', name: 'Deportes / Gym' },
      { id: 'cat_viajes', name: 'Viajes' },
    ],
  },
  {
    id: 'cat_seguros', name: 'Seguros', type: 'Fijo', icon: 'shield', color: '#1ABC9C',
    children: [
      { id: 'cat_seguro_auto', name: 'Seguro Auto' },
      { id: 'cat_seguro_hogar', name: 'Seguro Hogar' },
      { id: 'cat_seguro_vida', name: 'Seguro Vida' },
    ],
  },
  {
    id: 'cat_suscripciones', name: 'Suscripciones', type: 'Fijo', icon: 'repeat', color: '#F39C12',
    children: [
      { id: 'cat_software', name: 'Software / Apps' },
      { id: 'cat_memberships', name: 'Membresías' },
    ],
  },
  {
    id: 'cat_vestimenta', name: 'Vestimenta', type: 'Variable', icon: 'shirt', color: '#E67E22',
  },
  {
    id: 'cat_impuestos', name: 'Impuestos', type: 'Fijo', icon: 'landmark', color: '#7F8C8D',
    children: [
      { id: 'cat_imp_ganancias', name: 'Ganancias' },
      { id: 'cat_imp_bienes', name: 'Bienes Personales' },
      { id: 'cat_imp_municipal', name: 'Municipales / ABL' },
    ],
  },
  {
    id: 'cat_transferencias', name: 'Transferencias', type: 'Variable', icon: 'arrow-right-left', color: '#2ECC71',
  },
  {
    id: 'cat_otros', name: 'Otros', type: 'Variable', icon: 'ellipsis', color: '#BDC3C7',
  },
  {
    id: 'cat_sin_categorizar', name: 'Sin Categorizar', type: 'Variable', icon: 'circle-question', color: '#95A5A6',
  },
];
