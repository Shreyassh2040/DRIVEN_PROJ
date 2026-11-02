const { ApiError } = require('./http');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

class Validator {
  constructor() {
    this.errors = {};
    this.values = {};
  }

  raw(field, value) {
    this.values[field] = value;
    return value;
  }

  string(field, value, { label = field, required = false, min = 0, max = 255 } = {}) {
    const text = value == null ? '' : String(value).trim();
    if (!text) {
      if (required) this.errors[field] = `${label} is required.`;
      this.values[field] = null;
      return null;
    }
    if (text.length < min) {
      this.errors[field] = `${label} must be at least ${min} characters.`;
    } else if (text.length > max) {
      this.errors[field] = `${label} must be ${max} characters or fewer.`;
    }
    this.values[field] = text;
    return text;
  }

  email(field, value, { required = true } = {}) {
    const text = value == null ? '' : String(value).trim().toLowerCase();
    if (!text) {
      if (required) this.errors[field] = 'Email address is required.';
      this.values[field] = null;
      return null;
    }
    if (!EMAIL_RE.test(text) || text.length > 190) {
      this.errors[field] = 'Enter a valid email address.';
    }
    this.values[field] = text;
    return text;
  }

  password(field, value, { required = true, min = 8, max = 128 } = {}) {
    const text = typeof value === 'string' ? value : '';
    if (!text) {
      if (required) this.errors[field] = 'Password is required.';
      this.values[field] = null;
      return null;
    }
    if (text.length < min) this.errors[field] = `Password must be at least ${min} characters.`;
    else if (text.length > max) this.errors[field] = `Password must be ${max} characters or fewer.`;
    this.values[field] = text;
    return text;
  }

  enum(field, value, allowed, { label = field, required = false } = {}) {
    if (value == null || value === '') {
      if (required) this.errors[field] = `${label} is required.`;
      this.values[field] = null;
      return null;
    }
    if (!allowed.includes(value)) {
      this.errors[field] = `Select a valid ${label.toLowerCase()}.`;
      this.values[field] = null;
      return null;
    }
    this.values[field] = value;
    return value;
  }

  coordinates(latValue, lngValue) {
    const hasLat = latValue !== '' && latValue != null;
    const hasLng = lngValue !== '' && lngValue != null;
    if (!hasLat && !hasLng) {
      this.values.latitude = null;
      this.values.longitude = null;
      return;
    }
    if (hasLat !== hasLng) {
      this.errors.latitude = 'Latitude and longitude must be provided together.';
      return;
    }
    const lat = Number(latValue);
    const lng = Number(lngValue);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      this.errors.latitude = 'Latitude must be between -90 and 90.';
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      this.errors.longitude = 'Longitude must be between -180 and 180.';
    }
    this.values.latitude = lat;
    this.values.longitude = lng;
  }

  date(field, value, { required = false, label = field } = {}) {
    if (value == null || value === '') {
      if (required) this.errors[field] = `${label} is required.`;
      this.values[field] = null;
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      this.errors[field] = `${label} is invalid.`;
      this.values[field] = null;
      return null;
    }
    this.values[field] = date;
    return date;
  }

  id(field, value, { required = true, label = field } = {}) {
    if (value == null || value === '') {
      if (required) this.errors[field] = `${label} is required.`;
      this.values[field] = null;
      return null;
    }
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) {
      this.errors[field] = `${label} is invalid.`;
      this.values[field] = null;
      return null;
    }
    this.values[field] = id;
    return id;
  }

  custom(field, message) {
    this.errors[field] = message;
  }

  done() {
    if (Object.keys(this.errors).length > 0) {
      throw new ApiError(422, 'Please correct the highlighted fields.', this.errors);
    }
    return this.values;
  }
}

function parsePagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

function parseOptionalNumber(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new ApiError(422, `${field} must be a number.`, { [field]: `${field} must be a number.` });
  }
  return number;
}

module.exports = { Validator, parsePagination, parseOptionalNumber, EMAIL_RE };
