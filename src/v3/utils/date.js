export const getWeekDate = (date = new Date()) => {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monDay = new Date(date.setDate(diff));

  return monDay;
};

export const getOldestWeekDate = () => {
  const weekDate = getWeekDate();
  const validDate = weekDate.setMonth(weekDate.getMonth() - 12);
  return new Date(validDate);
};

export const addMonths = (date, value) => {
  const startDate = new Date(date);
  const result = startDate.setMonth(startDate.getMonth() + value);

  return new Date(result);
};

export const computeYearsDiff = (date) => {
  const userDate = new Date(date);
  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  const yearsDiff = ((now - userDate) / oneDay / 365).toFixed(2);

  return +yearsDiff;
};