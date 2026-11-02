const ROLES = ['citizen', 'officer', 'admin'];
const STAFF_ROLES = ['officer', 'admin'];
const ISSUE_STATUSES = ['submitted', 'in_progress', 'resolved', 'rejected'];
const ISSUE_CATEGORIES = [
  'pothole',
  'garbage',
  'streetlight',
  'water_supply',
  'drainage',
  'road_damage',
  'other'
];
const ISSUE_PRIORITIES = ['low', 'medium', 'high'];

const ISSUE_CATEGORY_LABELS = {
  pothole: 'Pothole',
  garbage: 'Garbage accumulation',
  streetlight: 'Streetlight failure',
  water_supply: 'Water supply',
  drainage: 'Drainage',
  road_damage: 'Road damage',
  other: 'Other civic issue'
};

const ISSUE_STATUS_LABELS = {
  submitted: 'Submitted',
  in_progress: 'In progress',
  resolved: 'Resolved',
  rejected: 'Rejected'
};

const PUBLIC_SETTING_KEYS = [
  'platform_name',
  'city_name',
  'tagline',
  'support_email',
  'support_phone',
  'office_address'
];

const SETTING_DEFAULTS = {
  platform_name: 'CivicFlow',
  city_name: '',
  tagline: 'Your city. Your services. Your voice.',
  support_email: '',
  support_phone: '',
  office_address: ''
};

module.exports = {
  ROLES,
  STAFF_ROLES,
  ISSUE_STATUSES,
  ISSUE_CATEGORIES,
  ISSUE_PRIORITIES,
  ISSUE_CATEGORY_LABELS,
  ISSUE_STATUS_LABELS,
  PUBLIC_SETTING_KEYS,
  SETTING_DEFAULTS
};
