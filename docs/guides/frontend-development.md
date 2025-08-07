# Frontend Development Guide

This guide covers building healthcare frontend applications using atomic-codegen generated FHIR types.

## Table of Contents

- [Overview](#overview)
- [React Integration](#react-integration)
- [Vue.js Integration](#vuejs-integration)
- [Form Handling](#form-handling)
- [Data Visualization](#data-visualization)
- [State Management](#state-management)
- [Testing](#testing)
- [Best Practices](#best-practices)

## Overview

atomic-codegen generates TypeScript types that integrate seamlessly with modern frontend frameworks, providing type safety and runtime validation for healthcare applications.

### Key Benefits

- **Type Safety**: Full TypeScript support with IntelliSense
- **Runtime Validation**: Generated type guards and validators
- **Framework Agnostic**: Works with React, Vue, Angular, and others
- **FHIR Compliance**: Ensures data conforms to healthcare standards

## React Integration

### Setup

First, generate your FHIR types:

```bash
bun atomic-codegen generate typescript \
  --from-package hl7.fhir.r4.core@4.0.1 \
  --from-package hl7.fhir.us.core@6.1.0 \
  --output ./src/types/fhir \
  --include-profiles
```

### Patient Registration Form

```typescript
import React, { useState } from 'react';
import { USCorePatient } from '../types/fhir';
import { isUSCorePatient } from '../types/fhir/guards';

interface PatientFormData {
  firstName: string;
  lastName: string;
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate: string;
  phone?: string;
  email?: string;
}

export function PatientRegistrationForm() {
  const [formData, setFormData] = useState<PatientFormData>({
    firstName: '',
    lastName: '',
    gender: 'unknown',
    birthDate: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Convert form data to FHIR Patient
    const patient: USCorePatient = {
      resourceType: 'Patient',
      identifier: [{
        use: 'official',
        system: 'http://hospital.org/patient-ids',
        value: `MRN-${Date.now()}`
      }],
      name: [{
        use: 'official',
        family: formData.lastName,
        given: [formData.firstName]
      }],
      gender: formData.gender,
      birthDate: formData.birthDate,
      active: true
    };

    // Add telecom if provided
    if (formData.phone || formData.email) {
      patient.telecom = [];
      if (formData.phone) {
        patient.telecom.push({
          system: 'phone',
          value: formData.phone,
          use: 'home'
        });
      }
      if (formData.email) {
        patient.telecom.push({
          system: 'email',
          value: formData.email,
          use: 'home'
        });
      }
    }

    // Validate FHIR resource
    if (!isUSCorePatient(patient)) {
      alert('Invalid patient data');
      return;
    }

    // Submit to API
    try {
      const response = await fetch('/fhir/Patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(patient)
      });
      
      if (response.ok) {
        alert('Patient registered successfully!');
        // Reset form or redirect
      }
    } catch (error) {
      console.error('Registration failed:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="firstName">First Name *</label>
        <input
          id="firstName"
          type="text"
          required
          value={formData.firstName}
          onChange={(e) => setFormData(prev => ({ 
            ...prev, 
            firstName: e.target.value 
          }))}
        />
      </div>
      
      <div>
        <label htmlFor="lastName">Last Name *</label>
        <input
          id="lastName"
          type="text"
          required
          value={formData.lastName}
          onChange={(e) => setFormData(prev => ({ 
            ...prev, 
            lastName: e.target.value 
          }))}
        />
      </div>

      <div>
        <label htmlFor="gender">Gender *</label>
        <select
          id="gender"
          required
          value={formData.gender}
          onChange={(e) => setFormData(prev => ({ 
            ...prev, 
            gender: e.target.value as any 
          }))}
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>

      <button type="submit">Register Patient</button>
    </form>
  );
}
```

## Vue.js Integration

### Patient List Component

```vue
<template>
  <div class="patient-list">
    <h2>Patients</h2>
    
    <div v-if="loading">Loading...</div>
    
    <div v-else>
      <div 
        v-for="patient in patients" 
        :key="patient.id"
        class="patient-card"
      >
        <h3>{{ getPatientName(patient) }}</h3>
        <p>Gender: {{ patient.gender }}</p>
        <p>Birth Date: {{ patient.birthDate }}</p>
        <button @click="viewPatient(patient.id!)">View Details</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { USCorePatient, Bundle } from '../types/fhir';
import { isUSCorePatient } from '../types/fhir/guards';

const patients = ref<USCorePatient[]>([]);
const loading = ref(true);

const getPatientName = (patient: USCorePatient): string => {
  const name = patient.name?.[0];
  if (!name) return 'Unknown';
  
  const given = name.given?.join(' ') || '';
  const family = name.family || '';
  return `${given} ${family}`.trim();
};

const fetchPatients = async () => {
  try {
    const response = await fetch('/fhir/Patient?_count=20');
    const bundle: Bundle = await response.json();
    
    if (bundle.entry) {
      patients.value = bundle.entry
        .map(entry => entry.resource)
        .filter(isUSCorePatient);
    }
  } catch (error) {
    console.error('Failed to fetch patients:', error);
  } finally {
    loading.value = false;
  }
};

const viewPatient = (patientId: string) => {
  // Navigate to patient details
  console.log('View patient:', patientId);
};

onMounted(fetchPatients);
</script>
```

## Form Handling

### React Hook Form Integration

```typescript
import { useForm } from 'react-hook-form';
import { USCorePatient } from '../types/fhir';
import { validateUSCorePatient } from '../types/fhir/validators';

interface PatientFormInputs {
  firstName: string;
  lastName: string;
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate: string;
  race?: string;
  ethnicity?: string;
}

export function PatientForm() {
  const { 
    register, 
    handleSubmit, 
    formState: { errors },
    setError 
  } = useForm<PatientFormInputs>();

  const onSubmit = async (data: PatientFormInputs) => {
    // Convert to FHIR Patient
    const patient: USCorePatient = {
      resourceType: 'Patient',
      identifier: [{ value: `MRN-${Date.now()}` }],
      name: [{
        family: data.lastName,
        given: [data.firstName]
      }],
      gender: data.gender,
      birthDate: data.birthDate
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
    const validation = validateUSCorePatient(patient);
    if (!validation.valid) {
      validation.errors.forEach(error => {
        setError('root', { message: error.message });
      });
      return;
    }

    // Submit patient
    await submitPatient(patient);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input
        {...register('firstName', { required: 'First name is required' })}
        placeholder="First Name"
      />
      {errors.firstName && <span>{errors.firstName.message}</span>}

      <input
        {...register('lastName', { required: 'Last name is required' })}
        placeholder="Last Name"
      />
      {errors.lastName && <span>{errors.lastName.message}</span>}

      <select {...register('gender', { required: true })}>
        <option value="male">Male</option>
        <option value="female">Female</option>
        <option value="other">Other</option>
        <option value="unknown">Unknown</option>
      </select>

      <input
        type="date"
        {...register('birthDate', { required: 'Birth date is required' })}
      />

      <button type="submit">Submit</button>
    </form>
  );
}
```

## Data Visualization

### Vital Signs Chart

```typescript
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { USCoreObservation } from '../types/fhir';

interface VitalSignsChartProps {
  observations: USCoreObservation[];
}

interface ChartData {
  date: string;
  systolic?: number;
  diastolic?: number;
}

export function VitalSignsChart({ observations }: VitalSignsChartProps) {
  const chartData: ChartData[] = observations
    .filter(obs => obs.component && obs.effectiveDateTime)
    .map(obs => {
      const date = new Date(obs.effectiveDateTime!).toLocaleDateString();
      const systolic = obs.component?.find(c => 
        c.code.coding?.[0]?.code === '8480-6'
      )?.valueQuantity?.value;
      const diastolic = obs.component?.find(c => 
        c.code.coding?.[0]?.code === '8462-4'
      )?.valueQuantity?.value;
      
      return { date, systolic, diastolic };
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div>
      <h3>Blood Pressure Trends</h3>
      <LineChart width={600} height={300} data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis domain={[60, 180]} />
        <Tooltip />
        <Line 
          type="monotone" 
          dataKey="systolic" 
          stroke="#8884d8" 
          name="Systolic"
        />
        <Line 
          type="monotone" 
          dataKey="diastolic" 
          stroke="#82ca9d" 
          name="Diastolic"
        />
      </LineChart>
    </div>
  );
}
```

## State Management

### Zustand Store

```typescript
import { create } from 'zustand';
import { USCorePatient, USCoreObservation } from '../types/fhir';

interface PatientStore {
  patients: USCorePatient[];
  currentPatient: USCorePatient | null;
  observations: USCoreObservation[];
  loading: boolean;
  error: string | null;
  
  fetchPatients: () => Promise<void>;
  selectPatient: (id: string) => Promise<void>;
  fetchObservations: (patientId: string) => Promise<void>;
  createPatient: (patient: USCorePatient) => Promise<void>;
}

export const usePatientStore = create<PatientStore>((set, get) => ({
  patients: [],
  currentPatient: null,
  observations: [],
  loading: false,
  error: null,

  fetchPatients: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/fhir/Patient');
      const bundle = await response.json();
      const patients = bundle.entry?.map((e: any) => e.resource) || [];
      set({ patients, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  selectPatient: async (id: string) => {
    set({ loading: true });
    try {
      const response = await fetch(`/fhir/Patient/${id}`);
      const patient = await response.json();
      set({ currentPatient: patient, loading: false });
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  },

  fetchObservations: async (patientId: string) => {
    try {
      const response = await fetch(`/fhir/Observation?subject=Patient/${patientId}`);
      const bundle = await response.json();
      const observations = bundle.entry?.map((e: any) => e.resource) || [];
      set({ observations });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  createPatient: async (patient: USCorePatient) => {
    set({ loading: true });
    try {
      const response = await fetch('/fhir/Patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: JSON.stringify(patient)
      });
      const created = await response.json();
      set(state => ({ 
        patients: [created, ...state.patients],
        loading: false 
      }));
    } catch (error) {
      set({ error: (error as Error).message, loading: false });
    }
  }
}));
```

## Testing

### Component Testing

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PatientRegistrationForm } from '../PatientRegistrationForm';

// Mock fetch
global.fetch = jest.fn();

describe('PatientRegistrationForm', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it('should render form fields', () => {
    render(<PatientRegistrationForm />);
    
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/gender/i)).toBeInTheDocument();
  });

  it('should submit valid patient data', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'patient-123' })
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
    
    fireEvent.click(screen.getByRole('button', { name: /register/i }));
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/fhir/Patient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/fhir+json' },
        body: expect.stringContaining('"resourceType":"Patient"')
      });
    });
  });
});
```

## Best Practices

### 1. Type Safety

Always use generated types:

```typescript
// Good: Use generated types
import { USCorePatient } from '../types/fhir';

const patient: USCorePatient = {
  resourceType: 'Patient',
  // TypeScript will enforce correct structure
};

// Bad: Using any or generic objects
const patient: any = {
  resourceType: 'Patient',
  // No type checking
};
```

### 2. Validation

Validate data at boundaries:

```typescript
// Validate API responses
const response = await fetch('/fhir/Patient/123');
const data = await response.json();

if (isUSCorePatient(data)) {
  // Safe to use as USCorePatient
  setPatient(data);
} else {
  console.error('Invalid patient data received');
}
```

### 3. Error Handling

Handle FHIR OperationOutcome responses:

```typescript
async function handleFHIRResponse(response: Response) {
  if (!response.ok) {
    const outcome = await response.json();
    if (outcome.resourceType === 'OperationOutcome') {
      const errors = outcome.issue?.map((issue: any) => issue.details?.text);
      throw new Error(`FHIR Error: ${errors?.join(', ')}`);
    }
  }
  return response.json();
}
```

### 4. Performance

Use React.memo for expensive components:

```typescript
import React, { memo } from 'react';

export const PatientCard = memo<{ patient: USCorePatient }>(({ patient }) => {
  return (
    <div>
      <h3>{getPatientName(patient)}</h3>
      {/* Expensive rendering logic */}
    </div>
  );
});
```

## Next Steps

- **[API Development Guide](./api-development.md)** - Building FHIR APIs
- **[Advanced Configuration](./advanced-configuration.md)** - Complex scenarios
- **[Examples](../../examples/frontend-app/)** - Complete React application

## Resources

- **[React Documentation](https://react.dev/)** - React framework
- **[Vue.js Guide](https://vuejs.org/guide/)** - Vue.js framework
- **[React Hook Form](https://react-hook-form.com/)** - Form handling
- **[Recharts](https://recharts.org/)** - Data visualization
