# Vitalitty AI 🥗🤖

Sistema de automatización para la creación de dietas personalizadas mediante inteligencia artificial.

## 📋 Descripción

Vitalitty AI es una aplicación web que permite a nutricionistas crear dietas personalizadas de forma automática mediante grabación de audio. El sistema utiliza IA (OpenAI Whisper + GPT-4) para transcribir, extraer datos y generar planes nutricionales completos en formato Word.

### Problema que resuelve

- ❌ **Antes**: Jesús grababa audios de WhatsApp → Ester transcribía manualmente → Creaba documento Word (2-3 horas)
- ✅ **Ahora**: Jesús graba audio en la app → IA procesa automáticamente → Descarga Word listo (2-3 minutos)

## 🚀 Stack Tecnológico

- **Framework**: Next.js 15 (App Router)
- **Frontend**: React 19 + TypeScript
- **UI**: shadcn/ui + Tailwind CSS
- **Backend**: Next.js API Routes + Server Actions
- **Base de Datos**: Supabase (PostgreSQL)
- **Autenticación**: Supabase Auth
- **Storage**: Supabase Storage
- **IA**: OpenAI (Whisper + GPT-4)
- **Documentos**: docx library
- **Deploy**: Vercel

## ✨ Funcionalidades

- [x] Autenticación segura con email/password
- [ ] Gestión de pacientes (CRUD)
- [ ] Grabación de audio en navegador
- [ ] Transcripción automática con Whisper
- [ ] Extracción de datos con GPT-4
- [ ] Generación de plan nutricional con IA
- [ ] Generación de documento Word (.docx)
- [ ] Descarga de dietas generadas
- [ ] Historial de dietas por paciente

## 🏗️ Arquitectura

```
app/
├── api/              # Backend (API Routes)
│   ├── auth/
│   ├── pacientes/
│   ├── audios/
│   └── dietas/
├── dashboard/        # Frontend (React)
├── pacientes/
└── login/

lib/                  # Servicios
├── supabase/
├── openai/
└── documents/

components/           # Componentes React
└── ui/              # shadcn/ui
```

## 🛠️ Instalación

### Prerrequisitos

- Node.js 20+
- npm o yarn
- Cuenta de Supabase
- API Key de OpenAI

### Configuración

1. **Clonar el repositorio**

```bash
git clone <repo-url>
cd v-ai
```

2. **Instalar dependencias**

```bash
npm install
```

3. **Configurar variables de entorno**

Crear archivo `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://apijxjakeffswxpiresl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# OpenAI
OPENAI_API_KEY=sk-...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. **Configurar Supabase**

Ejecutar scripts SQL en Supabase Dashboard:

- `database/schema.sql` - Crear tablas
- `database/policies.sql` - Configurar RLS
- Crear buckets: `audios`, `documentos`

5. **Ejecutar en desarrollo**

```bash
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## 📦 Scripts Disponibles

```bash
npm run dev          # Servidor de desarrollo
npm run build        # Build de producción
npm run start        # Servidor de producción
npm run lint         # Linter
npm run type-check   # Verificar tipos TypeScript
```

## 🗄️ Base de Datos

### Tablas principales:

- `pacientes` - Información de pacientes
- `dietas` - Dietas generadas
- `audios` - Audios grabados y transcripciones
- `mediciones` - Historial de peso/altura
- `documentos_generados` - Referencias a .docx

### Storage Buckets:

- `audios` - Archivos de audio (.webm)
- `documentos` - Documentos Word (.docx)

## 🤖 Flujo de IA

1. **Grabación**: Usuario graba audio en navegador (MediaRecorder API)
2. **Upload**: Audio se sube a Supabase Storage
3. **Transcripción**: Whisper API convierte audio a texto
4. **Extracción**: GPT-4 extrae datos estructurados (JSON)
5. **Generación**: GPT-4 genera plan nutricional (opcional)
6. **Documento**: docx library crea archivo Word
7. **Descarga**: Usuario descarga .docx

## 📝 Guión de Grabación

Jesús debe seguir un guión estructurado al grabar:

1. Datos generales (nombre, edad, peso, altura)
2. Objetivos y calorías
3. Información clínica (patologías, alergias, suplementos)
4. Estilo de vida (actividad física, sueño, agua)
5. Preferencias alimentarias
6. Plan nutricional (opcional - si no, IA lo genera)
7. Observaciones y próxima revisión

Ver `docs/guion_grabacion.md` para detalles completos.

## 🚀 Deploy

### Vercel (Recomendado)

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Configurar variables de entorno en Vercel Dashboard.

## 💰 Costes Estimados

| Servicio        | Coste Mensual |
| --------------- | ------------- |
| Vercel (Hobby)  | $0            |
| Supabase (Free) | $0            |
| OpenAI Whisper  | ~$30          |
| OpenAI GPT-4    | ~$40          |
| **TOTAL**       | **~$70/mes**  |

## 📚 Documentación

- [Plan de Implementación](docs/implementation_plan.md)
- [Arquitectura del Sistema](docs/arquitectura_sistema.md)
- [Guión de Grabación](docs/guion_grabacion.md)
- [Análisis Técnico](docs/analisis_tecnico.md)

## 🔐 Seguridad

- Autenticación con Supabase Auth
- Row Level Security (RLS) en todas las tablas
- Storage privado (no público)
- Variables de entorno para secrets
- HTTPS en producción (Vercel)

## 🧪 Testing

```bash
# Tests unitarios
npm run test

# Tests E2E
npm run test:e2e
```

## 🤝 Contribuir

Este es un proyecto privado para Vitalitty. No se aceptan contribuciones externas.

## 📄 Licencia

Propietario: Vitalitty  
Desarrollador: Juan

---

**Versión**: 0.1.0  
**Última actualización**: Enero 2026
