/**
 * Regular expression for a `DATE` ASN.1 value.
 */
export const DATE_REGEX = /^(\d{4})-((?:1[0-2])|0[1-9])-(\d{2})$/;

/**
 * Regular expression for a `TIME-OF-DAY` ASN.1 value.
 */
export const TIME_REGEX = /^((?:2[0-3])|[0-1]\d):([0-5]\d):([0-5]\d)$/;
