import { Patient } from './generated/types';
import { AnyResource, FHIRClient } from './generated/client';


const client = new FHIRClient({
  baseUrl: 'https://example.com/fhir',
});


const b = await client.searchBuilder<'Patient'>('Patient')