import * as primitives from '../types/primitives';
import * as complex from '../types/complex';
import type { Reference } from '../types/primitives'
import { DomainResource } from './DomainResource';

/**
 * A definition of a FHIR structure. This resource is used to describe the underlying resources, data types defined in FHIR, and also for describing extensions and constraints on resources and data types.
 * 
 * @see http://hl7.org/fhir/StructureDefinition/StructureDefinition
 * @extends DomainResource
 */
export interface StructureDefinition extends DomainResource {
  /** url field of type uri */
  url: string;
  /** name field of type string */
  name: string;
  /** status field of type code */
  status: string;
  /** kind field of type code */
  kind: string;
  /** abstract field of type boolean */
  abstract: boolean;
  /** type field of type uri */
  type: string;
  /** identifier field of type Identifier */
  identifier?: complex.Identifier[];
  /** version field of type string */
  version?: string;
  /** title field of type string */
  title?: string;
  /** experimental field of type boolean */
  experimental?: boolean;
  /** date field of type dateTime */
  date?: string;
  /** publisher field of type string */
  publisher?: string;
  /** contact field of type ContactDetail */
  contact?: StructureDefinitioncomplex.ContactDetail[];
  /** description field of type markdown */
  description?: string;
  /** useContext field of type UsageContext */
  useContext?: StructureDefinitioncomplex.UsageContext[];
  /** jurisdiction field of type CodeableConcept */
  jurisdiction?: complex.CodeableConcept[];
  /** purpose field of type markdown */
  purpose?: string;
  /** copyright field of type markdown */
  copyright?: string;
  /** keyword field of type Coding */
  keyword?: complex.Coding[];
  /** fhirVersion field of type code */
  fhirVersion?: string;
  /** mapping field of type mapping */
  mapping?: StructureDefinitionMapping[];
  /** context field of type context */
  context?: StructureDefinitionContext[];
  /** contextInvariant field of type string */
  contextInvariant?: string[];
  /** baseDefinition field of type canonical */
  baseDefinition?: string;
  /** derivation field of type code */
  derivation?: string;
  /** snapshot field of type snapshot */
  snapshot?: StructureDefinitionSnapshot;
  /** differential field of type differential */
  differential?: StructureDefinitionDifferential;
}

export interface StructureDefinitionContext extends complex.BackboneElement {
  /** type field of type code */
  type: string;
  /** expression field of type string */
  expression: string;
}

export interface StructureDefinitionDifferential extends complex.BackboneElement {
  /** element field of type ElementDefinition | Cardinality: 1..* */
  element: StructureDefinitioncomplex.ElementDefinition[];
}

export interface StructureDefinitionMapping extends complex.BackboneElement {
  /** identity field of type id */
  identity: string;
  /** uri field of type uri */
  uri?: string;
  /** name field of type string */
  name?: string;
  /** comment field of type string */
  comment?: string;
}

export interface StructureDefinitionSnapshot extends complex.BackboneElement {
  /** element field of type ElementDefinition | Cardinality: 1..* */
  element: StructureDefinitioncomplex.ElementDefinition[];
}
