import { useCallback, useEffect, useState } from "react";
import { advise, simulate, EFFICIENCY, type Advice, type Field, type IrrigationReport, type SimDay } from "@engine";
import { getField, listReports, putField, type LocalField, type LocalReport } from "../storage/db";
import { loadWeather, todayPK, type WeatherResult } from "../services/weather";

export const toEngineField = (f: LocalField): Partial<Field> => ({
  crop: f.crop, planting_date: f.planting_date, soil: f.soil, irrigation_method: f.irrigation_method, lat: f.lat, lon: f.lon,
  elevation: f.elevation ?? undefined, area_ha: f.area_ha, soil_confirmed: f.soil_confirmed,
});
export const toEngineReports = (rs: LocalReport[]): IrrigationReport[] => rs.map((r) => ({ date: r.date, status: r.status, gross_depth_mm: r.gross_depth_mm }));

export interface AdviceState {
  loading: boolean; field: LocalField | null; advice: Advice | null; weather: WeatherResult | null; reports: LocalReport[]; recent: SimDay[]; reload: () => void;
}

export function useAdvice(fieldId: string | undefined): AdviceState {
  const [s, setS] = useState<Omit<AdviceState, "reload">>({ loading: true, field: null, advice: null, weather: null, reports: [], recent: [] });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((x) => x + 1), []);
  useEffect(() => {
    if (!fieldId) { setS((p) => ({ ...p, loading: false })); return; }
    let live = true;
    (async () => {
      setS((p) => ({ ...p, loading: true }));
      let field = (await getField(fieldId)) ?? null;
      if (!field) { if (live) setS({ loading: false, field: null, advice: null, weather: null, reports: [], recent: [] }); return; }
      const weather = await loadWeather(field);
      if (weather.elevation != null && field.elevation !== weather.elevation) { field = { ...field, elevation: weather.elevation }; await putField(field); }
      const reports = await listReports(field.id);
      const today = todayPK();
      const eng = toEngineField(field);
      const advice = advise(eng, weather.days, toEngineReports(reports), today);
      let recent: SimDay[] = [];
      if (advice.status !== "insufficient_information") recent = simulate({ ...(eng as Field), elevation: field.elevation! }, weather.days, toEngineReports(reports), today).days.slice(-14);
      if (live) setS({ loading: false, field, advice, weather, reports, recent });
    })();
    return () => { live = false; };
  }, [fieldId, tick]);
  return { ...s, reload };
}
export const efficiencyFor = (method: string) => EFFICIENCY[method];
