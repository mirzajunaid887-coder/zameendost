import { useEffect, useState } from "react";
import { listFields, type LocalField } from "../storage/db";

export function useActiveField() {
  const [fields, setFields] = useState<LocalField[] | null>(null);
  const [id, setId] = useState<string | undefined>(() => localStorage.getItem("zd_active") ?? undefined);
  useEffect(() => { listFields().then(setFields); }, []);
  const active = fields?.find((f) => f.id === id) ?? fields?.[0];
  return { fields, active, setActive: (x: string) => { localStorage.setItem("zd_active", x); setId(x); } };
}
