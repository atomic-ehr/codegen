# Healthcare Frontend App Example

Complete React application using atomic-codegen generated FHIR types for a healthcare management system.

## Overview

This example demonstrates:

- ⚛️ **React 18 with TypeScript** and FHIR type safety
- 🏥 **Patient management interface** with US Core compliance  
- 📊 **Clinical data visualization** with observations and vital signs
- ✅ **Form validation** using FHIR constraints
- 🎨 **Modern UI components** with shadcn/ui
- 📱 **Responsive design** for desktop and mobile
- 🧪 **Comprehensive testing** with FHIR mock data

## Features

### Patient Management
- Patient registration with US Core profiles
- Patient search and filtering
- Demographics with race/ethnicity extensions
- Patient timeline and history

### Clinical Data
- Vital signs tracking (blood pressure, weight, height)
- Lab results visualization  
- Medication tracking
- Allergies and conditions management

### Data Visualization
- Interactive charts for vital signs trends
- Clinical timeline view
- Summary dashboards
- Export capabilities

## Technology Stack

- **Frontend**: React 18, TypeScript, Vite
- **UI**: shadcn/ui, Tailwind CSS, Lucide icons
- **Forms**: React Hook Form with FHIR validation
- **Charts**: Recharts for clinical data visualization
- **State**: Zustand for state management
- **HTTP**: Axios with FHIR interceptors
- **Testing**: Vitest, Testing Library, MSW

## Getting Started

### Prerequisites

- Node.js 18+ or Bun 1.0+
- Healthcare API running (see [Healthcare API Example](../healthcare-api/))

### 1. Generate FHIR Types

```bash
# Generate US Core types
atomic-codegen typeschema create \
  hl7.fhir.r4.core@4.0.1 \
  hl7.fhir.us.core@6.1.0 \
  -o fhir-uscore.ndjson

atomic-codegen generate typescript \
  -i fhir-uscore.ndjson \
  -o ./src/types/fhir \
  --generate-profiles \
  --generate-validators
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment

```bash
# .env.local
VITE_FHIR_BASE_URL=http://localhost:3000/fhir
VITE_API_BASE_URL=http://localhost:3000
```

### 4. Start Development Server

```bash
bun run dev
```

The application will be available at `http://localhost:5173`

## Project Structure

```
frontend-app/
├── public/                 # Static assets
├── src/
│   ├── components/         # React components
│   │   ├── ui/            # Base UI components (shadcn/ui)
│   │   ├── forms/         # Form components
│   │   ├── charts/        # Chart components
│   │   └── layout/        # Layout components
│   ├── pages/             # Page components
│   ├── hooks/             # Custom React hooks
│   ├── services/          # API services
│   ├── stores/            # Zustand stores
│   ├── types/             # Generated FHIR types
│   ├── utils/             # Utility functions
│   └── __tests__/         # Tests
├── tests/                 # Additional tests
└── docs/                  # Documentation
```

## Key Components

### Patient Registration Form

```typescript
// src/components/forms/PatientRegistrationForm.tsx
import { useForm } from 'react-hook-form';
import { USCorePatient } from '../../types/fhir';
import { validateUSCorePatient } from '../../types/fhir/guards';

interface PatientFormData {
  identifier: string;
  firstName: string;
  lastName: string;
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate: string;
  race?: string;
  ethnicity?: string;
  phone?: string;
  email?: string;
}

export function PatientRegistrationForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<PatientFormData>();

  const onSubmit = async (data: PatientFormData) => {
    // Convert form data to FHIR Patient
    const patient: USCorePatient = {
      resourceType: 'Patient',
      identifier: [{
        use: 'official',
        system: 'http://hospital.org/patient-ids',
        value: data.identifier
      }],
      name: [{
        use: 'official',
        family: data.lastName,
        given: [data.firstName]
      }],
      gender: data.gender,
      birthDate: data.birthDate,
      active: true
    };

    // Add race extension if provided
    if (data.race) {
      patient.extension = [{
        url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
        extension: [{
          url: 'text',
          valueString: data.race
        }]
      }];
    }

    // Validate FHIR resource
    if (!validateUSCorePatient(patient).valid) {
      toast.error('Invalid patient data');
      return;
    }

    // Submit to API
    await patientService.create(patient);
    toast.success('Patient created successfully');
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            {...register('firstName', { required: 'First name is required' })}
            className={errors.firstName ? 'border-red-500' : ''}
          />
          {errors.firstName && (
            <p className="text-sm text-red-500 mt-1">{errors.firstName.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            {...register('lastName', { required: 'Last name is required' })}
            className={errors.lastName ? 'border-red-500' : ''}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="gender">Gender *</Label>
          <Select {...register('gender', { required: 'Gender is required' })}>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="other">Other</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="birthDate">Birth Date *</Label>
          <Input
            type="date"
            {...register('birthDate', { required: 'Birth date is required' })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="race">Race</Label>
        <Select {...register('race')}>
          <SelectContent>
            <SelectItem value="American Indian or Alaska Native">
              American Indian or Alaska Native
            </SelectItem>
            <SelectItem value="Asian">Asian</SelectItem>
            <SelectItem value="Black or African American">
              Black or African American
            </SelectItem>
            <SelectItem value="Native Hawaiian or Other Pacific Islander">
              Native Hawaiian or Other Pacific Islander
            </SelectItem>
            <SelectItem value="White">White</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="w-full">
        Register Patient
      </Button>
    </form>
  );
}
```

### Patient Dashboard

```typescript
// src/components/PatientDashboard.tsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { USCorePatient, USCoreObservation } from '../types/fhir';
import { patientService, observationService } from '../services';
import { VitalSignsChart } from './charts/VitalSignsChart';
import { PatientInfo } from './PatientInfo';
import { ObservationList } from './ObservationList';

export function PatientDashboard() {
  const { patientId } = useParams<{ patientId: string }>();
  const [patient, setPatient] = useState<USCorePatient | null>(null);
  const [observations, setObservations] = useState<USCoreObservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPatientData = async () => {
      if (!patientId) return;

      try {
        const [patientData, observationData] = await Promise.all([
          patientService.getById(patientId),
          observationService.getByPatient(patientId)
        ]);

        setPatient(patientData);
        setObservations(observationData);
      } catch (error) {
        toast.error('Failed to load patient data');
      } finally {
        setLoading(false);
      }
    };

    loadPatientData();
  }, [patientId]);

  if (loading) {
    return <div className="flex justify-center p-8"><Spinner /></div>;
  }

  if (!patient) {
    return <div className="text-center p-8">Patient not found</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Patient Info */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Patient Information</CardTitle>
            </CardHeader>
            <CardContent>
              <PatientInfo patient={patient} />
            </CardContent>
          </Card>
        </div>

        {/* Clinical Data */}
        <div className="lg:col-span-2">
          <div className="space-y-6">
            {/* Vital Signs Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Vital Signs Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <VitalSignsChart observations={observations} />
              </CardContent>
            </Card>

            {/* Recent Observations */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Observations</CardTitle>
              </CardHeader>
              <CardContent>
                <ObservationList observations={observations.slice(0, 10)} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Vital Signs Chart

```typescript
// src/components/charts/VitalSignsChart.tsx
import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { USCoreObservation } from '../../types/fhir';
import { format, parseISO } from 'date-fns';

interface VitalSignsChartProps {
  observations: USCoreObservation[];
}

interface ChartData {
  date: string;
  systolic?: number;
  diastolic?: number;
  heartRate?: number;
  weight?: number;
  temperature?: number;
}

export function VitalSignsChart({ observations }: VitalSignsChartProps) {
  const chartData = useMemo(() => {
    const dataMap = new Map<string, ChartData>();

    observations.forEach(obs => {
      if (!obs.effectiveDateTime) return;

      const date = format(parseISO(obs.effectiveDateTime), 'MM/dd/yyyy');
      
      if (!dataMap.has(date)) {
        dataMap.set(date, { date });
      }

      const data = dataMap.get(date)!;

      // Blood pressure components
      if (obs.component) {
        obs.component.forEach(comp => {
          const code = comp.code.coding?.[0]?.code;
          const value = comp.valueQuantity?.value;

          if (code === '8480-6' && value) { // Systolic BP
            data.systolic = value;
          } else if (code === '8462-4' && value) { // Diastolic BP
            data.diastolic = value;
          }
        });
      }

      // Single value observations
      const code = obs.code.coding?.[0]?.code;
      const value = obs.valueQuantity?.value;

      if (code && value) {
        switch (code) {
          case '8867-4': // Heart rate
            data.heartRate = value;
            break;
          case '29463-7': // Body weight
            data.weight = value;
            break;
          case '8310-5': // Body temperature
            data.temperature = value;
            break;
        }
      }
    });

    return Array.from(dataMap.values()).sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }, [observations]);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis yAxisId="bp" orientation="left" domain={[60, 180]} />
        <YAxis yAxisId="hr" orientation="right" domain={[50, 120]} />
        <Tooltip />
        <Legend />
        
        <Line
          yAxisId="bp"
          type="monotone"
          dataKey="systolic"
          stroke="#ef4444"
          name="Systolic BP (mmHg)"
          strokeWidth={2}
        />
        <Line
          yAxisId="bp"
          type="monotone"
          dataKey="diastolic"
          stroke="#3b82f6"
          name="Diastolic BP (mmHg)"
          strokeWidth={2}
        />
        <Line
          yAxisId="hr"
          type="monotone"
          dataKey="heartRate"
          stroke="#10b981"
          name="Heart Rate (bpm)"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

### FHIR Service Layer

```typescript
// src/services/fhirService.ts
import axios from 'axios';
import { USCorePatient, USCoreObservation, Bundle } from '../types/fhir';
import { isUSCorePatient, isUSCoreObservation } from '../types/fhir/guards';

const fhirClient = axios.create({
  baseURL: import.meta.env.VITE_FHIR_BASE_URL,
  headers: {
    'Content-Type': 'application/fhir+json',
    'Accept': 'application/fhir+json'
  }
});

// Request interceptor for authentication
fhirClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
fhirClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle authentication error
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export class PatientService {
  static async getAll(searchParams?: Record<string, string>): Promise<USCorePatient[]> {
    const params = new URLSearchParams(searchParams);
    const response = await fhirClient.get(`/Patient?${params}`);
    
    const bundle: Bundle = response.data;
    if (bundle.entry) {
      return bundle.entry
        .map(entry => entry.resource)
        .filter(isUSCorePatient);
    }
    
    return [];
  }

  static async getById(id: string): Promise<USCorePatient> {
    const response = await fhirClient.get(`/Patient/${id}`);
    
    if (!isUSCorePatient(response.data)) {
      throw new Error('Invalid Patient resource received');
    }
    
    return response.data;
  }

  static async create(patient: USCorePatient): Promise<USCorePatient> {
    const response = await fhirClient.post('/Patient', patient);
    
    if (!isUSCorePatient(response.data)) {
      throw new Error('Invalid Patient resource received');
    }
    
    return response.data;
  }

  static async update(id: string, patient: USCorePatient): Promise<USCorePatient> {
    const response = await fhirClient.put(`/Patient/${id}`, patient);
    
    if (!isUSCorePatient(response.data)) {
      throw new Error('Invalid Patient resource received');
    }
    
    return response.data;
  }

  static async delete(id: string): Promise<void> {
    await fhirClient.delete(`/Patient/${id}`);
  }
}

export class ObservationService {
  static async getByPatient(patientId: string): Promise<USCoreObservation[]> {
    const response = await fhirClient.get(`/Observation?subject=Patient/${patientId}&_sort=-date`);
    
    const bundle: Bundle = response.data;
    if (bundle.entry) {
      return bundle.entry
        .map(entry => entry.resource)
        .filter(isUSCoreObservation);
    }
    
    return [];
  }

  static async create(observation: USCoreObservation): Promise<USCoreObservation> {
    const response = await fhirClient.post('/Observation', observation);
    
    if (!isUSCoreObservation(response.data)) {
      throw new Error('Invalid Observation resource received');
    }
    
    return response.data;
  }
}
```

### State Management

```typescript
// src/stores/patientStore.ts
import { create } from 'zustand';
import { USCorePatient } from '../types/fhir';
import { PatientService } from '../services/fhirService';

interface PatientStore {
  patients: USCorePatient[];
  currentPatient: USCorePatient | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  fetchPatients: (searchParams?: Record<string, string>) => Promise<void>;
  selectPatient: (id: string) => Promise<void>;
  createPatient: (patient: USCorePatient) => Promise<void>;
  updatePatient: (id: string, patient: USCorePatient) => Promise<void>;
  deletePatient: (id: string) => Promise<void>;
  clearError: () => void;
}

export const usePatientStore = create<PatientStore>((set, get) => ({
  patients: [],
  currentPatient: null,
  loading: false,
  error: null,

  fetchPatients: async (searchParams) => {
    set({ loading: true, error: null });
    try {
      const patients = await PatientService.getAll(searchParams);
      set({ patients, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  selectPatient: async (id) => {
    set({ loading: true, error: null });
    try {
      const patient = await PatientService.getById(id);
      set({ currentPatient: patient, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  createPatient: async (patient) => {
    set({ loading: true, error: null });
    try {
      const created = await PatientService.create(patient);
      set(state => ({ 
        patients: [created, ...state.patients],
        loading: false 
      }));
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  updatePatient: async (id, patient) => {
    set({ loading: true, error: null });
    try {
      const updated = await PatientService.update(id, patient);
      set(state => ({
        patients: state.patients.map(p => p.id === id ? updated : p),
        currentPatient: state.currentPatient?.id === id ? updated : state.currentPatient,
        loading: false
      }));
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  deletePatient: async (id) => {
    set({ loading: true, error: null });
    try {
      await PatientService.delete(id);
      set(state => ({
        patients: state.patients.filter(p => p.id !== id),
        currentPatient: state.currentPatient?.id === id ? null : state.currentPatient,
        loading: false
      }));
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },

  clearError: () => set({ error: null })
}));
```

## Testing

### Component Testing

```typescript
// src/components/__tests__/PatientRegistrationForm.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PatientRegistrationForm } from '../forms/PatientRegistrationForm';
import { PatientService } from '../../services/fhirService';

// Mock the service
vi.mock('../../services/fhirService', () => ({
  PatientService: {
    create: vi.fn()
  }
}));

describe('PatientRegistrationForm', () => {
  it('should render all required fields', () => {
    render(<PatientRegistrationForm />);
    
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gender/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/birth date/i)).toBeInTheDocument();
  });

  it('should validate required fields', async () => {
    render(<PatientRegistrationForm />);
    
    const submitButton = screen.getByRole('button', { name: /register patient/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
      expect(screen.getByText(/last name is required/i)).toBeInTheDocument();
    });
  });

  it('should submit valid patient data', async () => {
    const mockCreate = vi.mocked(PatientService.create);
    mockCreate.mockResolvedValue({
      resourceType: 'Patient',
      id: 'patient-123',
      name: [{ family: 'Doe', given: ['John'] }],
      gender: 'male'
    });

    render(<PatientRegistrationForm />);
    
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: 'John' }
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: 'Doe' }
    });
    fireEvent.change(screen.getByLabelText(/gender/i), {
      target: { value: 'male' }
    });
    fireEvent.change(screen.getByLabelText(/birth date/i), {
      target: { value: '1990-01-01' }
    });
    
    const submitButton = screen.getByRole('button', { name: /register patient/i });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceType: 'Patient',
          name: [{ use: 'official', family: 'Doe', given: ['John'] }],
          gender: 'male',
          birthDate: '1990-01-01'
        })
      );
    });
  });
});
```

### Integration Testing

```typescript
// src/__tests__/integration/patient-workflow.test.tsx
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { setupServer } from 'msw/node';
import { rest } from 'msw';
import { App } from '../App';
import { testPatients } from './fixtures/patients';

// Mock API server
const server = setupServer(
  rest.get('http://localhost:3000/fhir/Patient', (req, res, ctx) => {
    return res(ctx.json({
      resourceType: 'Bundle',
      entry: testPatients.map(patient => ({ resource: patient }))
    }));
  }),
  
  rest.post('http://localhost:3000/fhir/Patient', (req, res, ctx) => {
    const patient = req.body;
    return res(ctx.status(201), ctx.json({
      ...patient,
      id: 'new-patient-123'
    }));
  })
);

beforeAll(() => server.listen());
afterAll(() => server.close());

describe('Patient Workflow', () => {
  it('should allow creating and viewing a patient', async () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );
    
    // Navigate to patient registration
    fireEvent.click(screen.getByText(/register new patient/i));
    
    // Fill out form
    fireEvent.change(screen.getByLabelText(/first name/i), {
      target: { value: 'Jane' }
    });
    fireEvent.change(screen.getByLabelText(/last name/i), {
      target: { value: 'Smith' }
    });
    fireEvent.change(screen.getByLabelText(/gender/i), {
      target: { value: 'female' }
    });
    fireEvent.change(screen.getByLabelText(/birth date/i), {
      target: { value: '1985-05-15' }
    });
    
    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /register patient/i }));
    
    // Should redirect to patient list and show success message
    await waitFor(() => {
      expect(screen.getByText(/patient created successfully/i)).toBeInTheDocument();
    });
    
    // Should show the new patient in the list
    await waitFor(() => {
      expect(screen.getByText(/jane smith/i)).toBeInTheDocument();
    });
  });
});
```

## Deployment

### Build Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'fhir-types': ['./src/types/fhir'],
          'ui-components': ['./src/components/ui'],
          vendor: ['react', 'react-dom', 'react-router-dom']
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/fhir': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
```

### Docker Support

```dockerfile
# Dockerfile
FROM node:18-alpine as builder

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

COPY . .
RUN pnpm build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## Key Features

### ✅ Complete FHIR Type Safety
- All components use generated FHIR types
- Form validation based on FHIR constraints  
- Runtime type checking with type guards
- IntelliSense support throughout the application

### 🏥 Healthcare-Specific UI
- Patient-centric design
- Clinical data visualization
- US Core compliance
- Healthcare workflows

### 📱 Modern User Experience
- Responsive design for all devices
- Intuitive navigation
- Real-time data updates
- Accessible components

### 🧪 Comprehensive Testing
- Component unit tests
- Integration tests with MSW
- FHIR validation testing
- Performance testing

## Performance Optimizations

- **Code Splitting**: Separate chunks for FHIR types and UI components
- **Tree Shaking**: Only include used FHIR resources
- **Lazy Loading**: Route-based code splitting
- **Memoization**: React.memo for expensive components
- **Virtual Scrolling**: For large patient lists
- **API Caching**: Service worker for FHIR resource caching

## Next Steps

1. **Customize**: Adapt components for your specific use case
2. **Extend**: Add support for additional FHIR resources
3. **Deploy**: Use the Docker setup for production
4. **Monitor**: Add analytics and error tracking
5. **Scale**: Implement offline support and PWA features

## Related Examples

- [Healthcare API](../healthcare-api/) - Backend API for this frontend
- [Mobile App](../mobile-app/) - React Native version
- [Vue.js App](../vue-app/) - Vue.js equivalent

## Questions?

- Check the [Frontend Development Guide](../../docs/guides/frontend-development.md)
- Review the [React Integration Tutorial](../../docs/tutorials/11-frontend-apps.md)
- Open an issue on [GitHub](https://github.com/atomic-ehr/codegen/issues)