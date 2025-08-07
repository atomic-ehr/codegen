# Task 007: Mock Data Generation

## Priority: Low
## Status: TODO
## Estimated Effort: 2 hours

## Description
Generate mock data factories for FHIR resources to support testing and development workflows.

## Goals
- Generate realistic mock data for all resources
- Support deterministic generation with seeds
- Allow customization of generated data
- Integrate with testing frameworks
- Support relationships between resources

## Implementation

### 1. Mock Generator Architecture
```typescript
interface MockGeneratorOptions {
  seed?: number;
  locale?: string;
  includeOptional?: boolean;
  maxArrayLength?: number;
  customProviders?: Map<string, MockProvider>;
}

class MockDataGenerator {
  generateFactory(resource: TypeSchema): string;
  generateMockData(resource: TypeSchema, options?: MockGeneratorOptions): any;
  generateRelatedData(resources: TypeSchema[]): Map<string, any[]>;
}
```

### 2. Mock Factory Template
```typescript
// Generated mock factory for Patient
export class PatientMockFactory {
  private faker: Faker;
  private options: MockOptions;

  constructor(options: MockOptions = {}) {
    this.options = {
      seed: Date.now(),
      locale: 'en',
      includeOptional: false,
      ...options
    };
    
    this.faker = new Faker({ locale: this.options.locale });
    if (this.options.seed) {
      this.faker.seed(this.options.seed);
    }
  }

  generate(overrides?: Partial<Patient>): Patient {
    const base: Patient = {
      resourceType: 'Patient',
      id: this.generateId(),
      meta: this.generateMeta(),
      identifier: this.generateIdentifiers(),
      active: this.faker.datatype.boolean(),
      name: this.generateHumanNames(),
      telecom: this.generateContactPoints(),
      gender: this.generateGender(),
      birthDate: this.generateBirthDate(),
      address: this.generateAddresses(),
    };

    if (this.options.includeOptional) {
      Object.assign(base, {
        deceased: this.faker.datatype.boolean() 
          ? { deceasedBoolean: true }
          : undefined,
        maritalStatus: this.generateCodeableConcept('marital-status'),
        multipleBirth: this.faker.datatype.boolean()
          ? { multipleBirthBoolean: this.faker.datatype.boolean() }
          : undefined,
        photo: this.generateAttachments(0, 2),
        contact: this.generateContacts(0, 3),
        communication: this.generateCommunications(1, 3),
        generalPractitioner: this.generateReferences('Practitioner', 0, 2),
        managingOrganization: this.generateReference('Organization'),
        link: this.generatePatientLinks(0, 2)
      });
    }

    return { ...base, ...overrides };
  }

  generateMany(count: number, overrides?: Partial<Patient>[]): Patient[] {
    return Array.from({ length: count }, (_, i) => 
      this.generate(overrides?.[i])
    );
  }

  private generateId(): string {
    return this.faker.string.alphanumeric(16);
  }

  private generateMeta(): Meta {
    return {
      versionId: this.faker.string.numeric(3),
      lastUpdated: this.faker.date.recent().toISOString(),
      source: '#' + this.faker.string.alphanumeric(8)
    };
  }

  private generateIdentifiers(): Identifier[] {
    const identifiers: Identifier[] = [];
    
    // MRN
    identifiers.push({
      use: 'official',
      type: {
        coding: [{
          system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
          code: 'MR',
          display: 'Medical Record Number'
        }]
      },
      system: 'http://hospital.example.org/mrn',
      value: this.faker.string.numeric(8),
      period: {
        start: this.faker.date.past(5).toISOString()
      }
    });

    // SSN (if US locale)
    if (this.options.locale === 'en_US' && this.faker.datatype.boolean(0.7)) {
      identifiers.push({
        use: 'secondary',
        type: {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
            code: 'SS',
            display: 'Social Security Number'
          }]
        },
        system: 'http://hl7.org/fhir/sid/us-ssn',
        value: this.faker.string.numeric(9)
      });
    }

    return identifiers;
  }

  private generateHumanNames(): HumanName[] {
    const names: HumanName[] = [];
    
    // Official name
    names.push({
      use: 'official',
      family: this.faker.person.lastName(),
      given: [
        this.faker.person.firstName(),
        this.faker.datatype.boolean(0.3) 
          ? this.faker.person.middleName() 
          : undefined
      ].filter(Boolean) as string[],
      prefix: this.faker.datatype.boolean(0.2) 
        ? [this.faker.person.prefix()] 
        : undefined,
      suffix: this.faker.datatype.boolean(0.1) 
        ? [this.faker.person.suffix()] 
        : undefined
    });

    // Nickname
    if (this.faker.datatype.boolean(0.2)) {
      names.push({
        use: 'nickname',
        given: [this.faker.person.firstName()]
      });
    }

    return names;
  }

  private generateGender(): 'male' | 'female' | 'other' | 'unknown' {
    const genders: Array<'male' | 'female' | 'other' | 'unknown'> = 
      ['male', 'female', 'other', 'unknown'];
    return this.faker.helpers.arrayElement(genders);
  }

  private generateBirthDate(): string {
    const age = this.faker.number.int({ min: 0, max: 100 });
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - age);
    return birthDate.toISOString().split('T')[0];
  }

  private generateAddresses(): Address[] {
    const addresses: Address[] = [];
    
    // Home address
    addresses.push({
      use: 'home',
      type: 'physical',
      line: [
        this.faker.location.streetAddress(),
        this.faker.datatype.boolean(0.3) 
          ? this.faker.location.secondaryAddress() 
          : undefined
      ].filter(Boolean) as string[],
      city: this.faker.location.city(),
      state: this.faker.location.state({ abbreviated: true }),
      postalCode: this.faker.location.zipCode(),
      country: this.faker.location.countryCode('alpha-3')
    });

    // Work address
    if (this.faker.datatype.boolean(0.4)) {
      addresses.push({
        use: 'work',
        type: 'physical',
        line: [this.faker.location.streetAddress()],
        city: this.faker.location.city(),
        state: this.faker.location.state({ abbreviated: true }),
        postalCode: this.faker.location.zipCode()
      });
    }

    return addresses;
  }

  private generateContactPoints(): ContactPoint[] {
    const contacts: ContactPoint[] = [];
    
    // Phone
    contacts.push({
      system: 'phone',
      value: this.faker.phone.number(),
      use: 'mobile',
      rank: 1
    });

    // Email
    if (this.faker.datatype.boolean(0.8)) {
      contacts.push({
        system: 'email',
        value: this.faker.internet.email(),
        use: 'home',
        rank: 2
      });
    }

    return contacts;
  }

  private generateReference(resourceType: string): Reference {
    return {
      reference: `${resourceType}/${this.faker.string.alphanumeric(16)}`,
      display: this.faker.company.name()
    };
  }

  private generateReferences(
    resourceType: string,
    min: number,
    max: number
  ): Reference[] {
    const count = this.faker.number.int({ min, max });
    return Array.from({ length: count }, () => 
      this.generateReference(resourceType)
    );
  }
}
```

### 3. Related Data Generation
```typescript
// Generate related resources with consistent references
export class RelatedDataGenerator {
  private patients: Patient[] = [];
  private practitioners: Practitioner[] = [];
  private organizations: Organization[] = [];
  private encounters: Encounter[] = [];
  private observations: Observation[] = [];

  constructor(private options: MockOptions = {}) {}

  generateHealthcareNetwork(config: {
    patientCount: number;
    practitionerCount: number;
    organizationCount: number;
    encountersPerPatient: number;
    observationsPerEncounter: number;
  }): Bundle {
    // Generate organizations first
    this.organizations = new OrganizationMockFactory(this.options)
      .generateMany(config.organizationCount);

    // Generate practitioners linked to organizations
    this.practitioners = new PractitionerMockFactory(this.options)
      .generateMany(config.practitionerCount)
      .map((p, i) => ({
        ...p,
        organization: [{
          reference: `Organization/${this.organizations[i % this.organizations.length].id}`
        }]
      }));

    // Generate patients linked to organizations and practitioners
    this.patients = new PatientMockFactory(this.options)
      .generateMany(config.patientCount)
      .map((p, i) => ({
        ...p,
        managingOrganization: {
          reference: `Organization/${this.organizations[i % this.organizations.length].id}`
        },
        generalPractitioner: [{
          reference: `Practitioner/${this.practitioners[i % this.practitioners.length].id}`
        }]
      }));

    // Generate encounters for patients
    this.patients.forEach(patient => {
      const encounters = new EncounterMockFactory(this.options)
        .generateMany(config.encountersPerPatient)
        .map(e => ({
          ...e,
          subject: { reference: `Patient/${patient.id}` },
          participant: [{
            individual: {
              reference: `Practitioner/${this.faker.helpers.arrayElement(this.practitioners).id}`
            }
          }],
          serviceProvider: {
            reference: `Organization/${this.faker.helpers.arrayElement(this.organizations).id}`
          }
        }));
      
      this.encounters.push(...encounters);

      // Generate observations for encounters
      encounters.forEach(encounter => {
        const observations = new ObservationMockFactory(this.options)
          .generateMany(config.observationsPerEncounter)
          .map(o => ({
            ...o,
            subject: { reference: `Patient/${patient.id}` },
            encounter: { reference: `Encounter/${encounter.id}` },
            performer: [{
              reference: `Practitioner/${this.faker.helpers.arrayElement(this.practitioners).id}`
            }]
          }));
        
        this.observations.push(...observations);
      });
    });

    return this.toBundle();
  }

  private toBundle(): Bundle {
    const allResources = [
      ...this.organizations,
      ...this.practitioners,
      ...this.patients,
      ...this.encounters,
      ...this.observations
    ];

    return {
      resourceType: 'Bundle',
      type: 'collection',
      total: allResources.length,
      entry: allResources.map(resource => ({
        resource,
        fullUrl: `urn:uuid:${resource.id}`
      }))
    };
  }
}
```

### 4. Test Integration
```typescript
// Jest/Vitest integration
export function setupMockFactories() {
  return {
    patient: new PatientMockFactory({ seed: 123 }),
    observation: new ObservationMockFactory({ seed: 123 }),
    encounter: new EncounterMockFactory({ seed: 123 }),
    // ... other factories
  };
}

// Test usage
describe('Patient API', () => {
  const mocks = setupMockFactories();

  it('should create a patient', async () => {
    const mockPatient = mocks.patient.generate({
      name: [{ given: ['Test'], family: 'User' }]
    });

    const result = await api.createPatient(mockPatient);
    expect(result.id).toBeDefined();
    expect(result.name[0].family).toBe('User');
  });

  it('should handle bulk patients', async () => {
    const patients = mocks.patient.generateMany(100);
    const results = await api.createBatch(patients);
    expect(results).toHaveLength(100);
  });
});
```

### 5. Customization Support
```typescript
// Custom providers for specific fields
export class CustomMockProviders {
  static medicationProvider(): CodeableConcept {
    const medications = [
      { code: '387207008', display: 'Ibuprofen 200mg' },
      { code: '396064000', display: 'Aspirin 81mg' },
      { code: '317334001', display: 'Metformin 500mg' }
    ];
    
    return {
      coding: [faker.helpers.arrayElement(medications)]
    };
  }

  static conditionProvider(): CodeableConcept {
    const conditions = [
      { code: '73211009', display: 'Diabetes mellitus' },
      { code: '38341003', display: 'Hypertension' },
      { code: '195967001', display: 'Asthma' }
    ];
    
    return {
      coding: [faker.helpers.arrayElement(conditions)]
    };
  }
}

// Usage with custom providers
const factory = new ObservationMockFactory({
  customProviders: new Map([
    ['code', CustomMockProviders.medicationProvider]
  ])
});
```

## Files to Create

### New Files
- `src/fhir/generators/typescript/mocks.ts`
- `src/fhir/features/mocks/factory.ts`
- `src/fhir/features/mocks/providers.ts`
- `src/fhir/features/mocks/related.ts`
- `test/fhir/mocks.test.ts`

### Modified Files
- `src/api/generators/typescript.ts` - Add mock generation option
- `src/config.ts` - Add mock generation configuration

## Success Criteria
- [ ] Mock factories generate valid FHIR resources
- [ ] Deterministic generation with seeds works
- [ ] Related resources have consistent references
- [ ] Custom providers allow domain-specific data
- [ ] Integration with test frameworks is smooth
- [ ] Performance is good for large datasets

## Testing
```bash
# Unit tests
bun test test/fhir/mocks.test.ts

# Validation tests
bun test test/integration/mock-validation.test.ts

# Performance tests
bun test test/benchmarks/mock-generation.test.ts
```

## Dependencies
- Task 001: Reorganize FHIR Module Structure
- Task 002: Enhance TypeScript Interface Generation
- Task 005: Validators and Type Guards