export interface BusinessHoursCfg {
  business_hours_only?:     boolean;
  business_hours_start?:    string;    // "HH:MM"
  business_hours_end?:      string;    // "HH:MM"
  business_hours_timezone?: string;
  business_hours_days?:     number[];  // 0=Sun … 6=Sat
}

export function isWithinBusinessHours(cfg: BusinessHoursCfg): boolean {
  if (!cfg.business_hours_only) return true;
  const tz     = cfg.business_hours_timezone ?? 'Asia/Kolkata';
  const tzDate = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const day     = tzDate.getDay();
  const minutes = tzDate.getHours() * 60 + tzDate.getMinutes();
  const [sh = 9, sm = 0] = (cfg.business_hours_start ?? '09:00').split(':').map(Number);
  const [eh = 18, em = 0] = (cfg.business_hours_end ?? '18:00').split(':').map(Number);
  const days = (cfg.business_hours_days?.length ?? 0) > 0 ? cfg.business_hours_days! : [1, 2, 3, 4, 5];
  return days.includes(day) && minutes >= sh * 60 + sm && minutes < eh * 60 + em;
}
