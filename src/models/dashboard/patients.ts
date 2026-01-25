export interface Patient {
  id: string;
  created_at: string;
  updated_at: string;
  name_surnames: string;
  mail: string;
  age: number;
  phone: string;
  gender: string;
  height: number;
  weight: number;
  created_by: string;
  value?: string;
  label?: string;
}
