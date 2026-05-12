import * as FS from '@atomic-ehr/fhirschema';
import { FHIRSchema, StructureDefinition as StructureDefinition$1, FHIRSchemaElement } from '@atomic-ehr/fhirschema';
import { CanonicalManager, PreprocessContext } from '@atomic-ehr/fhir-canonical-manager';

interface Extension extends Element {
    url: string;
    valueCode?: string;
    valueUri?: string;
}

interface Element {
    extension?: Extension[];
    id?: string;
}

interface Period extends Element {
    end?: string;
    start?: string;
}

interface Address extends Element {
    city?: string;
    country?: string;
    district?: string;
    line?: string[];
    period?: Period;
    postalCode?: string;
    state?: string;
    text?: string;
    type?: ("postal" | "physical" | "both");
    use?: ("home" | "work" | "temp" | "old" | "billing");
}

interface Quantity extends Element {
    code?: string;
    comparator?: ("<" | "<=" | ">=" | ">");
    system?: string;
    unit?: string;
    value?: number;
}

interface Age extends Quantity {
}

interface Coding<T extends string = string> extends Element {
    code?: T;
    display?: string;
    system?: string;
    userSelected?: boolean;
    version?: string;
}

interface CodeableConcept<T extends string = string> extends Element {
    coding?: Coding<T>[];
    text?: string;
}

interface Identifier extends Element {
    assigner?: Reference<"Organization">;
    period?: Period;
    system?: string;
    type?: CodeableConcept<("DL" | "PPN" | "BRN" | "MR" | "MCN" | "EN" | "TAX" | "NIIP" | "PRN" | "MD" | "DR" | "ACSN" | "UDI" | "SNO" | "SB" | "PLAC" | "FILL" | "JHN" | string)>;
    use?: ("usual" | "official" | "temp" | "secondary" | "old");
    value?: string;
}

interface Reference<T extends string = string> extends Element {
    display?: string;
    identifier?: Identifier;
    reference?: `${T}/${string}`;
    type?: string;
}

interface Annotation extends Element {
    authorReference?: Reference<"Organization" | "Patient" | "Practitioner" | "RelatedPerson">;
    authorString?: string;
    text: string;
    time?: string;
}

interface Attachment extends Element {
    contentType?: string;
    creation?: string;
    data?: string;
    hash?: string;
    language?: ("ar" | "bn" | "cs" | "da" | "de" | "de-AT" | "de-CH" | "de-DE" | "el" | "en" | "en-AU" | "en-CA" | "en-GB" | "en-IN" | "en-NZ" | "en-SG" | "en-US" | "es" | "es-AR" | "es-ES" | "es-UY" | "fi" | "fr" | "fr-BE" | "fr-CH" | "fr-FR" | "fy" | "fy-NL" | "hi" | "hr" | "it" | "it-CH" | "it-IT" | "ja" | "ko" | "nl" | "nl-BE" | "nl-NL" | "no" | "no-NO" | "pa" | "pl" | "pt" | "pt-BR" | "ru" | "ru-RU" | "sr" | "sr-RS" | "sv" | "sv-SE" | "te" | "zh" | "zh-CN" | "zh-HK" | "zh-SG" | "zh-TW" | string);
    size?: number;
    title?: string;
    url?: string;
}

interface BackboneElement extends Element {
    modifierExtension?: Extension[];
}

interface ContactPoint extends Element {
    period?: Period;
    rank?: number;
    system?: ("phone" | "fax" | "email" | "pager" | "url" | "sms" | "other");
    use?: ("home" | "work" | "temp" | "old" | "mobile");
    value?: string;
}

interface ContactDetail extends Element {
    name?: string;
    telecom?: ContactPoint[];
}

interface Narrative extends Element {
    div: string;
    status: ("generated" | "extensions" | "additional" | "empty");
}

interface Meta extends Element {
    lastUpdated?: string;
    profile?: string[];
    security?: Coding[];
    source?: string;
    tag?: Coding[];
    versionId?: string;
}

interface Resource {
    resourceType: "CodeSystem" | "DomainResource" | "Resource" | "StructureDefinition" | "ValueSet";
    id?: string;
    implicitRules?: string;
    language?: ("ar" | "bn" | "cs" | "da" | "de" | "de-AT" | "de-CH" | "de-DE" | "el" | "en" | "en-AU" | "en-CA" | "en-GB" | "en-IN" | "en-NZ" | "en-SG" | "en-US" | "es" | "es-AR" | "es-ES" | "es-UY" | "fi" | "fr" | "fr-BE" | "fr-CH" | "fr-FR" | "fy" | "fy-NL" | "hi" | "hr" | "it" | "it-CH" | "it-IT" | "ja" | "ko" | "nl" | "nl-BE" | "nl-NL" | "no" | "no-NO" | "pa" | "pl" | "pt" | "pt-BR" | "ru" | "ru-RU" | "sr" | "sr-RS" | "sv" | "sv-SE" | "te" | "zh" | "zh-CN" | "zh-HK" | "zh-SG" | "zh-TW" | string);
    meta?: Meta;
}

interface DomainResource<T extends Resource = Resource> extends Resource {
    resourceType: "CodeSystem" | "DomainResource" | "StructureDefinition" | "ValueSet";
    contained?: T[];
    extension?: Extension[];
    modifierExtension?: Extension[];
    text?: Narrative;
}

interface Range extends Element {
    high?: Quantity;
    low?: Quantity;
}

interface UsageContext extends Element {
    code: Coding<("gender" | "age" | "focus" | "user" | "workflow" | "task" | "venue" | "species" | "program" | string)>;
    valueCodeableConcept?: CodeableConcept;
    valueQuantity?: Quantity;
    valueRange?: Range;
    valueReference?: Reference<"Group" | "HealthcareService" | "InsurancePlan" | "Location" | "Organization" | "PlanDefinition" | "ResearchStudy">;
}

interface CodeSystemConcept extends BackboneElement {
    code: string;
    concept?: CodeSystemConcept[];
    definition?: string;
    designation?: CodeSystemConceptDesignation[];
    display?: string;
    property?: CodeSystemConceptProperty[];
}
interface CodeSystemConceptDesignation extends BackboneElement {
    language?: ("ar" | "bn" | "cs" | "da" | "de" | "de-AT" | "de-CH" | "de-DE" | "el" | "en" | "en-AU" | "en-CA" | "en-GB" | "en-IN" | "en-NZ" | "en-SG" | "en-US" | "es" | "es-AR" | "es-ES" | "es-UY" | "fi" | "fr" | "fr-BE" | "fr-CH" | "fr-FR" | "fy" | "fy-NL" | "hi" | "hr" | "it" | "it-CH" | "it-IT" | "ja" | "ko" | "nl" | "nl-BE" | "nl-NL" | "no" | "no-NO" | "pa" | "pl" | "pt" | "pt-BR" | "ru" | "ru-RU" | "sr" | "sr-RS" | "sv" | "sv-SE" | "te" | "zh" | "zh-CN" | "zh-HK" | "zh-SG" | "zh-TW" | string);
    use?: Coding<("900000000000003001" | "900000000000013009" | string)>;
    value: string;
}
interface CodeSystemConceptProperty extends BackboneElement {
    code: string;
    valueBoolean?: boolean;
    valueCode?: string;
    valueCoding?: Coding;
    valueDateTime?: string;
    valueDecimal?: number;
    valueInteger?: number;
    valueString?: string;
}
interface CodeSystemFilter extends BackboneElement {
    code: string;
    description?: string;
    operator: ("=" | "is-a" | "descendent-of" | "is-not-a" | "regex" | "in" | "not-in" | "generalizes" | "exists")[];
    value: string;
}
interface CodeSystemProperty extends BackboneElement {
    code: string;
    description?: string;
    type: ("code" | "Coding" | "string" | "integer" | "boolean" | "dateTime" | "decimal");
    uri?: string;
}
interface CodeSystem extends DomainResource {
    resourceType: "CodeSystem";
    caseSensitive?: boolean;
    compositional?: boolean;
    concept?: CodeSystemConcept[];
    contact?: ContactDetail[];
    content: ("not-present" | "example" | "fragment" | "complete" | "supplement");
    copyright?: string;
    count?: number;
    date?: string;
    description?: string;
    experimental?: boolean;
    filter?: CodeSystemFilter[];
    hierarchyMeaning?: ("grouped-by" | "is-a" | "part-of" | "classified-with");
    identifier?: Identifier[];
    jurisdiction?: CodeableConcept[];
    name?: string;
    property?: CodeSystemProperty[];
    publisher?: string;
    purpose?: string;
    status: ("draft" | "active" | "retired" | "unknown");
    supplements?: string;
    title?: string;
    url?: string;
    useContext?: UsageContext[];
    valueSet?: string;
    version?: string;
    versionNeeded?: boolean;
}

interface Contributor extends Element {
    contact?: ContactDetail[];
    name: string;
    type: ("author" | "editor" | "reviewer" | "endorser");
}

interface Count extends Quantity {
}

interface Duration extends Quantity {
}

interface DataRequirementCodeFilter extends Element {
    code?: Coding[];
    path?: string;
    searchParam?: string;
    valueSet?: string;
}
interface DataRequirementDateFilter extends Element {
    path?: string;
    searchParam?: string;
    valueDateTime?: string;
    valueDuration?: Duration;
    valuePeriod?: Period;
}
interface DataRequirementSort extends Element {
    direction: ("ascending" | "descending");
    path: string;
}
interface DataRequirement extends Element {
    codeFilter?: DataRequirementCodeFilter[];
    dateFilter?: DataRequirementDateFilter[];
    limit?: number;
    mustSupport?: string[];
    profile?: string[];
    sort?: DataRequirementSort[];
    subjectCodeableConcept?: CodeableConcept;
    subjectReference?: Reference<"Group">;
    type: string;
}

interface Distance extends Quantity {
}

interface Ratio extends Element {
    denominator?: Quantity;
    numerator?: Quantity;
}

interface TimingRepeat extends Element {
    boundsDuration?: Duration;
    boundsPeriod?: Period;
    boundsRange?: Range;
    count?: number;
    countMax?: number;
    dayOfWeek?: ("mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun")[];
    duration?: number;
    durationMax?: number;
    durationUnit?: ("s" | "min" | "h" | "d" | "wk" | "mo" | "a");
    frequency?: number;
    frequencyMax?: number;
    offset?: number;
    period?: number;
    periodMax?: number;
    periodUnit?: ("s" | "min" | "h" | "d" | "wk" | "mo" | "a");
    timeOfDay?: string[];
    when?: ("MORN" | "MORN.early" | "MORN.late" | "NOON" | "AFT" | "AFT.early" | "AFT.late" | "EVE" | "EVE.early" | "EVE.late" | "NIGHT" | "PHS" | "HS" | "WAKE" | "C" | "CM" | "CD" | "CV" | "AC" | "ACM" | "ACD" | "ACV" | "PC" | "PCM" | "PCD" | "PCV")[];
}
interface Timing extends BackboneElement {
    code?: CodeableConcept<("BID" | "TID" | "QID" | "AM" | "PM" | "QD" | "QOD" | "Q1H" | "Q2H" | "Q3H" | "Q4H" | "Q6H" | "Q8H" | "BED" | "WK" | "MO" | string)>;
    event?: string[];
    repeat?: TimingRepeat;
}

interface DosageDoseAndRate extends Element {
    doseQuantity?: Quantity;
    doseRange?: Range;
    rateQuantity?: Quantity;
    rateRange?: Range;
    rateRatio?: Ratio;
    type?: CodeableConcept;
}
interface Dosage extends BackboneElement {
    additionalInstruction?: CodeableConcept[];
    asNeededBoolean?: boolean;
    asNeededCodeableConcept?: CodeableConcept;
    doseAndRate?: DosageDoseAndRate[];
    maxDosePerAdministration?: Quantity;
    maxDosePerLifetime?: Quantity;
    maxDosePerPeriod?: Ratio;
    method?: CodeableConcept;
    patientInstruction?: string;
    route?: CodeableConcept;
    sequence?: number;
    site?: CodeableConcept;
    text?: string;
    timing?: Timing;
}

interface Expression extends Element {
    description?: string;
    expression?: string;
    language: ("text/cql" | "text/fhirpath" | "application/x-fhir-query" | string);
    name?: string;
    reference?: string;
}

interface HumanName extends Element {
    family?: string;
    given?: string[];
    period?: Period;
    prefix?: string[];
    suffix?: string[];
    text?: string;
    use?: ("usual" | "official" | "temp" | "nickname" | "anonymous" | "old" | "maiden");
}

interface Money extends Element {
    currency?: string;
    value?: number;
}

interface ParameterDefinition extends Element {
    documentation?: string;
    max?: string;
    min?: number;
    name?: string;
    profile?: string;
    type: string;
    use: ("in" | "out");
}

interface RelatedArtifact extends Element {
    citation?: string;
    display?: string;
    document?: Attachment;
    label?: string;
    resource?: string;
    type: ("documentation" | "justification" | "citation" | "predecessor" | "successor" | "derived-from" | "depends-on" | "composed-of");
    url?: string;
}

interface SampledData extends Element {
    data?: string;
    dimensions: number;
    factor?: number;
    lowerLimit?: number;
    origin: Quantity;
    period: number;
    upperLimit?: number;
}

interface Signature extends Element {
    data?: string;
    onBehalfOf?: Reference<"Device" | "Organization" | "Patient" | "Practitioner" | "PractitionerRole" | "RelatedPerson">;
    sigFormat?: string;
    targetFormat?: string;
    type: Coding<("1.2.840.10065.1.12.1.1" | "1.2.840.10065.1.12.1.2" | "1.2.840.10065.1.12.1.3" | "1.2.840.10065.1.12.1.4" | "1.2.840.10065.1.12.1.5" | "1.2.840.10065.1.12.1.6" | "1.2.840.10065.1.12.1.7" | "1.2.840.10065.1.12.1.8" | "1.2.840.10065.1.12.1.9" | "1.2.840.10065.1.12.1.10" | "1.2.840.10065.1.12.1.11" | "1.2.840.10065.1.12.1.12" | "1.2.840.10065.1.12.1.13" | "1.2.840.10065.1.12.1.14" | "1.2.840.10065.1.12.1.15" | "1.2.840.10065.1.12.1.16" | "1.2.840.10065.1.12.1.17" | "1.2.840.10065.1.12.1.18" | string)>[];
    when: string;
    who: Reference<"Device" | "Organization" | "Patient" | "Practitioner" | "PractitionerRole" | "RelatedPerson">;
}

interface TriggerDefinition extends Element {
    condition?: Expression;
    data?: DataRequirement[];
    name?: string;
    timingDate?: string;
    timingDateTime?: string;
    timingReference?: Reference<"Schedule">;
    timingTiming?: Timing;
    type: ("named-event" | "periodic" | "data-changed" | "data-added" | "data-modified" | "data-removed" | "data-accessed" | "data-access-ended");
}

interface ElementDefinitionBase extends Element {
    max: string;
    min: number;
    path: string;
}
interface ElementDefinitionBinding extends Element {
    description?: string;
    strength: ("required" | "extensible" | "preferred" | "example");
    valueSet?: string;
}
interface ElementDefinitionConstraint extends Element {
    expression?: string;
    human: string;
    key: string;
    requirements?: string;
    severity: ("error" | "warning");
    source?: string;
    xpath?: string;
}
interface ElementDefinitionExample extends Element {
    label: string;
    valueAddress?: Address;
    valueAge?: Age;
    valueAnnotation?: Annotation;
    valueAttachment?: Attachment;
    valueBase64Binary?: string;
    valueBoolean?: boolean;
    valueCanonical?: string;
    valueCode?: string;
    valueCodeableConcept?: CodeableConcept;
    valueCoding?: Coding;
    valueContactDetail?: ContactDetail;
    valueContactPoint?: ContactPoint;
    valueContributor?: Contributor;
    valueCount?: Count;
    valueDataRequirement?: DataRequirement;
    valueDate?: string;
    valueDateTime?: string;
    valueDecimal?: number;
    valueDistance?: Distance;
    valueDosage?: Dosage;
    valueDuration?: Duration;
    valueExpression?: Expression;
    valueHumanName?: HumanName;
    valueId?: string;
    valueIdentifier?: Identifier;
    valueInstant?: string;
    valueInteger?: number;
    valueMarkdown?: string;
    valueMeta?: Meta;
    valueMoney?: Money;
    valueOid?: string;
    valueParameterDefinition?: ParameterDefinition;
    valuePeriod?: Period;
    valuePositiveInt?: number;
    valueQuantity?: Quantity;
    valueRange?: Range;
    valueRatio?: Ratio;
    valueReference?: Reference;
    valueRelatedArtifact?: RelatedArtifact;
    valueSampledData?: SampledData;
    valueSignature?: Signature;
    valueString?: string;
    valueTime?: string;
    valueTiming?: Timing;
    valueTriggerDefinition?: TriggerDefinition;
    valueUnsignedInt?: number;
    valueUri?: string;
    valueUrl?: string;
    valueUsageContext?: UsageContext;
    valueUuid?: string;
}
interface ElementDefinitionMapping extends Element {
    comment?: string;
    identity: string;
    language?: string;
    map: string;
}
interface ElementDefinitionSlicing extends Element {
    description?: string;
    discriminator?: ElementDefinitionSlicingDiscriminator[];
    ordered?: boolean;
    rules: ("closed" | "open" | "openAtEnd");
}
interface ElementDefinitionSlicingDiscriminator extends Element {
    path: string;
    type: ("value" | "exists" | "pattern" | "type" | "profile");
}
interface ElementDefinitionType extends Element {
    aggregation?: ("contained" | "referenced" | "bundled")[];
    code: string;
    profile?: string[];
    targetProfile?: string[];
    versioning?: ("either" | "independent" | "specific");
}
interface ElementDefinition extends BackboneElement {
    alias?: string[];
    base?: ElementDefinitionBase;
    binding?: ElementDefinitionBinding;
    code?: Coding[];
    comment?: string;
    condition?: string[];
    constraint?: ElementDefinitionConstraint[];
    contentReference?: string;
    defaultValueAddress?: Address;
    defaultValueAge?: Age;
    defaultValueAnnotation?: Annotation;
    defaultValueAttachment?: Attachment;
    defaultValueBase64Binary?: string;
    defaultValueBoolean?: boolean;
    defaultValueCanonical?: string;
    defaultValueCode?: string;
    defaultValueCodeableConcept?: CodeableConcept;
    defaultValueCoding?: Coding;
    defaultValueContactDetail?: ContactDetail;
    defaultValueContactPoint?: ContactPoint;
    defaultValueContributor?: Contributor;
    defaultValueCount?: Count;
    defaultValueDataRequirement?: DataRequirement;
    defaultValueDate?: string;
    defaultValueDateTime?: string;
    defaultValueDecimal?: number;
    defaultValueDistance?: Distance;
    defaultValueDosage?: Dosage;
    defaultValueDuration?: Duration;
    defaultValueExpression?: Expression;
    defaultValueHumanName?: HumanName;
    defaultValueId?: string;
    defaultValueIdentifier?: Identifier;
    defaultValueInstant?: string;
    defaultValueInteger?: number;
    defaultValueMarkdown?: string;
    defaultValueMeta?: Meta;
    defaultValueMoney?: Money;
    defaultValueOid?: string;
    defaultValueParameterDefinition?: ParameterDefinition;
    defaultValuePeriod?: Period;
    defaultValuePositiveInt?: number;
    defaultValueQuantity?: Quantity;
    defaultValueRange?: Range;
    defaultValueRatio?: Ratio;
    defaultValueReference?: Reference;
    defaultValueRelatedArtifact?: RelatedArtifact;
    defaultValueSampledData?: SampledData;
    defaultValueSignature?: Signature;
    defaultValueString?: string;
    defaultValueTime?: string;
    defaultValueTiming?: Timing;
    defaultValueTriggerDefinition?: TriggerDefinition;
    defaultValueUnsignedInt?: number;
    defaultValueUri?: string;
    defaultValueUrl?: string;
    defaultValueUsageContext?: UsageContext;
    defaultValueUuid?: string;
    definition?: string;
    example?: ElementDefinitionExample[];
    fixedAddress?: Address;
    fixedAge?: Age;
    fixedAnnotation?: Annotation;
    fixedAttachment?: Attachment;
    fixedBase64Binary?: string;
    fixedBoolean?: boolean;
    fixedCanonical?: string;
    fixedCode?: string;
    fixedCodeableConcept?: CodeableConcept;
    fixedCoding?: Coding;
    fixedContactDetail?: ContactDetail;
    fixedContactPoint?: ContactPoint;
    fixedContributor?: Contributor;
    fixedCount?: Count;
    fixedDataRequirement?: DataRequirement;
    fixedDate?: string;
    fixedDateTime?: string;
    fixedDecimal?: number;
    fixedDistance?: Distance;
    fixedDosage?: Dosage;
    fixedDuration?: Duration;
    fixedExpression?: Expression;
    fixedHumanName?: HumanName;
    fixedId?: string;
    fixedIdentifier?: Identifier;
    fixedInstant?: string;
    fixedInteger?: number;
    fixedMarkdown?: string;
    fixedMeta?: Meta;
    fixedMoney?: Money;
    fixedOid?: string;
    fixedParameterDefinition?: ParameterDefinition;
    fixedPeriod?: Period;
    fixedPositiveInt?: number;
    fixedQuantity?: Quantity;
    fixedRange?: Range;
    fixedRatio?: Ratio;
    fixedReference?: Reference;
    fixedRelatedArtifact?: RelatedArtifact;
    fixedSampledData?: SampledData;
    fixedSignature?: Signature;
    fixedString?: string;
    fixedTime?: string;
    fixedTiming?: Timing;
    fixedTriggerDefinition?: TriggerDefinition;
    fixedUnsignedInt?: number;
    fixedUri?: string;
    fixedUrl?: string;
    fixedUsageContext?: UsageContext;
    fixedUuid?: string;
    isModifier?: boolean;
    isModifierReason?: string;
    isSummary?: boolean;
    label?: string;
    mapping?: ElementDefinitionMapping[];
    max?: string;
    maxLength?: number;
    maxValueDate?: string;
    maxValueDateTime?: string;
    maxValueDecimal?: number;
    maxValueInstant?: string;
    maxValueInteger?: number;
    maxValuePositiveInt?: number;
    maxValueQuantity?: Quantity;
    maxValueTime?: string;
    maxValueUnsignedInt?: number;
    meaningWhenMissing?: string;
    min?: number;
    minValueDate?: string;
    minValueDateTime?: string;
    minValueDecimal?: number;
    minValueInstant?: string;
    minValueInteger?: number;
    minValuePositiveInt?: number;
    minValueQuantity?: Quantity;
    minValueTime?: string;
    minValueUnsignedInt?: number;
    mustSupport?: boolean;
    orderMeaning?: string;
    path: string;
    patternAddress?: Address;
    patternAge?: Age;
    patternAnnotation?: Annotation;
    patternAttachment?: Attachment;
    patternBase64Binary?: string;
    patternBoolean?: boolean;
    patternCanonical?: string;
    patternCode?: string;
    patternCodeableConcept?: CodeableConcept;
    patternCoding?: Coding;
    patternContactDetail?: ContactDetail;
    patternContactPoint?: ContactPoint;
    patternContributor?: Contributor;
    patternCount?: Count;
    patternDataRequirement?: DataRequirement;
    patternDate?: string;
    patternDateTime?: string;
    patternDecimal?: number;
    patternDistance?: Distance;
    patternDosage?: Dosage;
    patternDuration?: Duration;
    patternExpression?: Expression;
    patternHumanName?: HumanName;
    patternId?: string;
    patternIdentifier?: Identifier;
    patternInstant?: string;
    patternInteger?: number;
    patternMarkdown?: string;
    patternMeta?: Meta;
    patternMoney?: Money;
    patternOid?: string;
    patternParameterDefinition?: ParameterDefinition;
    patternPeriod?: Period;
    patternPositiveInt?: number;
    patternQuantity?: Quantity;
    patternRange?: Range;
    patternRatio?: Ratio;
    patternReference?: Reference;
    patternRelatedArtifact?: RelatedArtifact;
    patternSampledData?: SampledData;
    patternSignature?: Signature;
    patternString?: string;
    patternTime?: string;
    patternTiming?: Timing;
    patternTriggerDefinition?: TriggerDefinition;
    patternUnsignedInt?: number;
    patternUri?: string;
    patternUrl?: string;
    patternUsageContext?: UsageContext;
    patternUuid?: string;
    representation?: ("xmlAttr" | "xmlText" | "typeAttr" | "cdaText" | "xhtml")[];
    requirements?: string;
    short?: string;
    sliceIsConstraining?: boolean;
    sliceName?: string;
    slicing?: ElementDefinitionSlicing;
    type?: ElementDefinitionType[];
}

interface StructureDefinitionContext extends BackboneElement {
    expression: string;
    type: ("fhirpath" | "element" | "extension");
}
interface StructureDefinitionDifferential extends BackboneElement {
    element: ElementDefinition[];
}
interface StructureDefinitionMapping extends BackboneElement {
    comment?: string;
    identity: string;
    name?: string;
    uri?: string;
}
interface StructureDefinitionSnapshot extends BackboneElement {
    element: ElementDefinition[];
}
interface StructureDefinition extends DomainResource {
    resourceType: "StructureDefinition";
    abstract: boolean;
    baseDefinition?: string;
    contact?: ContactDetail[];
    context?: StructureDefinitionContext[];
    contextInvariant?: string[];
    copyright?: string;
    date?: string;
    derivation?: ("specialization" | "constraint");
    description?: string;
    differential?: StructureDefinitionDifferential;
    experimental?: boolean;
    fhirVersion?: ("0.01" | "0.05" | "0.06" | "0.11" | "0.0.80" | "0.0.81" | "0.0.82" | "0.4.0" | "0.5.0" | "1.0.0" | "1.0.1" | "1.0.2" | "1.1.0" | "1.4.0" | "1.6.0" | "1.8.0" | "3.0.0" | "3.0.1" | "3.3.0" | "3.5.0" | "4.0.0" | "4.0.1");
    identifier?: Identifier[];
    jurisdiction?: CodeableConcept[];
    keyword?: Coding<("fhir-structure" | "custom-resource" | "dam" | "wire-format" | "archetype" | "template" | string)>[];
    kind: ("primitive-type" | "complex-type" | "resource" | "logical");
    mapping?: StructureDefinitionMapping[];
    name: string;
    publisher?: string;
    purpose?: string;
    snapshot?: StructureDefinitionSnapshot;
    status: ("draft" | "active" | "retired" | "unknown");
    title?: string;
    type: string;
    url: string;
    useContext?: UsageContext[];
    version?: string;
}

interface ValueSetCompose extends BackboneElement {
    exclude?: ValueSetComposeInclude[];
    inactive?: boolean;
    include: ValueSetComposeInclude[];
    lockedDate?: string;
}
interface ValueSetComposeInclude extends BackboneElement {
    concept?: ValueSetComposeIncludeConcept[];
    filter?: ValueSetComposeIncludeFilter[];
    system?: string;
    valueSet?: string[];
    version?: string;
}
interface ValueSetComposeIncludeConcept extends BackboneElement {
    code: string;
    designation?: ValueSetComposeIncludeConceptDesignation[];
    display?: string;
}
interface ValueSetComposeIncludeConceptDesignation extends BackboneElement {
    language?: ("ar" | "bn" | "cs" | "da" | "de" | "de-AT" | "de-CH" | "de-DE" | "el" | "en" | "en-AU" | "en-CA" | "en-GB" | "en-IN" | "en-NZ" | "en-SG" | "en-US" | "es" | "es-AR" | "es-ES" | "es-UY" | "fi" | "fr" | "fr-BE" | "fr-CH" | "fr-FR" | "fy" | "fy-NL" | "hi" | "hr" | "it" | "it-CH" | "it-IT" | "ja" | "ko" | "nl" | "nl-BE" | "nl-NL" | "no" | "no-NO" | "pa" | "pl" | "pt" | "pt-BR" | "ru" | "ru-RU" | "sr" | "sr-RS" | "sv" | "sv-SE" | "te" | "zh" | "zh-CN" | "zh-HK" | "zh-SG" | "zh-TW" | string);
    use?: Coding<("900000000000003001" | "900000000000013009" | string)>;
    value: string;
}
interface ValueSetComposeIncludeFilter extends BackboneElement {
    op: ("=" | "is-a" | "descendent-of" | "is-not-a" | "regex" | "in" | "not-in" | "generalizes" | "exists");
    property: string;
    value: string;
}
interface ValueSetExpansion extends BackboneElement {
    contains?: ValueSetExpansionContains[];
    identifier?: string;
    offset?: number;
    parameter?: ValueSetExpansionParameter[];
    timestamp: string;
    total?: number;
}
interface ValueSetExpansionContains extends BackboneElement {
    abstract?: boolean;
    code?: string;
    contains?: ValueSetExpansionContains[];
    designation?: ValueSetComposeIncludeConceptDesignation[];
    display?: string;
    inactive?: boolean;
    system?: string;
    version?: string;
}
interface ValueSetExpansionParameter extends BackboneElement {
    name: string;
    valueBoolean?: boolean;
    valueCode?: string;
    valueDateTime?: string;
    valueDecimal?: number;
    valueInteger?: number;
    valueString?: string;
    valueUri?: string;
}
interface ValueSet extends DomainResource {
    resourceType: "ValueSet";
    compose?: ValueSetCompose;
    contact?: ContactDetail[];
    copyright?: string;
    date?: string;
    description?: string;
    expansion?: ValueSetExpansion;
    experimental?: boolean;
    identifier?: Identifier[];
    immutable?: boolean;
    jurisdiction?: CodeableConcept[];
    name?: string;
    publisher?: string;
    purpose?: string;
    status: ("draft" | "active" | "retired" | "unknown");
    title?: string;
    url?: string;
    useContext?: UsageContext[];
    version?: string;
}

/**
 * A code generation friendly representation of FHIR StructureDefinition and
 * FHIR Schema designed to simplify SDK resource classes/types generation.
 */

type Name = string & {
    readonly __brand: unique symbol;
};
type CanonicalUrl = string & {
    readonly __brand: unique symbol;
};
type PkgName$1 = string;
type PkgVersion = string;
interface PackageMeta {
    name: PkgName$1;
    version: PkgVersion;
}
type RichStructureDefinition = Omit<StructureDefinition, "url"> & {
    package_name: PkgName$1;
    package_version: PkgVersion;
    url: CanonicalUrl;
};
type FHIRSchemaKind = "primitive-type" | "complex-type" | "resource" | "logical";
type RichFHIRSchemaBase = Omit<FS.FHIRSchema, "package_meta" | "base" | "name" | "url" | "derivation" | "kind"> & {
    package_meta: PackageMeta;
    name: Name;
    url: CanonicalUrl;
    base: CanonicalUrl;
    kind: FHIRSchemaKind;
};
type RichProfileFHIRSchema = RichFHIRSchemaBase & {
    derivation: "constraint";
};
type RichPrimitiveFHIRSchema = RichFHIRSchemaBase & {
    derivation: "specialization";
    kind: "primitive-type";
};
type RichComplexTypeFHIRSchema = RichFHIRSchemaBase & {
    derivation: "specialization";
    kind: "complex-type";
};
type RichResourceFHIRSchema = RichFHIRSchemaBase & {
    derivation: "specialization";
    kind: "resource";
};
type RichLogicalFHIRSchema = RichFHIRSchemaBase & {
    derivation: "specialization";
    kind: "logical";
};
type RichSpecializationFHIRSchema = RichPrimitiveFHIRSchema | RichComplexTypeFHIRSchema | RichResourceFHIRSchema | RichLogicalFHIRSchema;
type RichFHIRSchema = RichProfileFHIRSchema | RichSpecializationFHIRSchema;
type RichValueSet = Omit<ValueSet, "name" | "url"> & {
    package_meta: PackageMeta;
    name: Name;
    url: CanonicalUrl;
};

type CollisionResolution = {
    package: string;
    canonical: string;
};
type ResolveCollisionsConf = Record<string, CollisionResolution>;
type IrConf = {
    treeShake?: TreeShakeConf;
    promoteLogical?: LogicalPromotionConf;
    resolveCollisions?: ResolveCollisionsConf;
};
type LogicalPromotionConf = Record<PkgName$1, CanonicalUrl[]>;
type TreeShakeConf = Record<string, Record<string, TreeShakeRule>>;
type TreeShakeRule = {
    ignoreFields?: string[];
    selectFields?: string[];
    ignoreExtensions?: string[];
};

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "SILENT";
type LogEntry<T extends string = string> = {
    level: LogLevel;
    tag?: T;
    message: string;
    suppressed: boolean;
    prefix: string;
    timestamp: number;
};
type Log<T extends string = string> = {
    warn: TaggedLogFn<T>;
    dryWarn: TaggedLogFn<T>;
    info: TaggedLogFn<T>;
    error: TaggedLogFn<T>;
    debug: TaggedLogFn<T>;
};
type LogManager<T extends string = string> = Log<T> & {
    fork(prefix: string, opts?: Partial<LoggerOptions<T>>): LogManager<T>;
    as<Narrower extends string>(): LogManager<Narrower>;
    tagCounts(): Readonly<Record<string, number>>;
    printTagSummary(): void;
    buffer(): readonly LogEntry<T>[];
    bufferClear(): void;
};
type TaggedLogFn<T extends string> = (...args: [string] | [T, string]) => void;
type LoggerOptions<T extends string> = {
    prefix?: string;
    suppressTags?: T[];
    level?: LogLevel;
};

type CodegenTag = "#binding" | "#largeValueSet" | "#fieldTypeNotFound" | "#skipCanonical" | "#duplicateSchema" | "#duplicateCanonical" | "#resolveBase" | "#resolveCollisionMiss";
type CodegenLog = Log<CodegenTag>;
type CodegenLogManager = LogManager<CodegenTag>;
declare const mkCodegenLogger: (opts?: LoggerOptions<CodegenTag>) => LogManager<CodegenTag>;

type Register = {
    testAppendFs(fs: FHIRSchema): void;
    ensureSpecializationCanonicalUrl(name: string | Name | CanonicalUrl): CanonicalUrl;
    resolveSd(pkg: PackageMeta, canonicalUrl: CanonicalUrl): StructureDefinition$1 | undefined;
    resolveFs(pkg: PackageMeta, canonicalUrl: CanonicalUrl): RichFHIRSchema | undefined;
    resolveFsGenealogy(pkg: PackageMeta, canonicalUrl: CanonicalUrl): RichFHIRSchema[];
    resolveFsSpecializations(pkg: PackageMeta, canonicalUrl: CanonicalUrl): RichFHIRSchema[];
    allSd(): RichStructureDefinition[];
    /** Returns all FHIRSchemas from all packages in the resolver */
    allFs(): RichFHIRSchema[];
    /** Returns all ValueSets from all packages in the resolver */
    allVs(): RichValueSet[];
    resolveVs(_pkg: PackageMeta, canonicalUrl: CanonicalUrl): RichValueSet | undefined;
    resolveAny(canonicalUrl: CanonicalUrl): any | undefined;
    resolveElementSnapshot(fhirSchema: RichFHIRSchema, path: string[]): FHIRSchemaElement;
    getAllElementKeys(elems: Record<string, FHIRSchemaElement>): string[];
    resolver: PackageAwareResolver;
    resolutionTree: () => ResolutionTree;
};
type PkgId = string;
type PkgName = string;
type FocusedResource = StructureDefinition$1 | ValueSet | CodeSystem;
type CanonicalResolution<T> = {
    deep: number;
    pkg: PackageMeta;
    pkgId: PkgId;
    resource: T;
};
type PackageIndex = {
    pkg: PackageMeta;
    canonicalResolution: Record<CanonicalUrl, CanonicalResolution<FocusedResource>[]>;
    fhirSchemas: Record<CanonicalUrl, RichFHIRSchema>;
    valueSets: Record<CanonicalUrl, RichValueSet>;
};
type PackageAwareResolver = Record<PkgId, PackageIndex>;
type ResolutionTree = Record<PkgName, Record<CanonicalUrl, {
    deep: number;
    pkg: PackageMeta;
}[]>>;
type RegisterConfig = {
    logger?: CodegenLog;
    focusedPackages?: PackageMeta[];
    /** Custom FHIR package registry URL */
    registry?: string;
};
declare const registerFromManager: (manager: ReturnType<typeof CanonicalManager>, { logger, focusedPackages }: RegisterConfig) => Promise<Register>;
declare const registerFromPackageMetas: (packageMetas: PackageMeta[], conf: RegisterConfig) => Promise<Register>;

type FileSystemWriterOptions = {
    outputDir: string;
    inMemoryOnly?: boolean;
    logger?: CodegenLog;
    resolveAssets?: (fn: string) => string;
};
type WriterOptions = FileSystemWriterOptions & {
    tabSize: number;
    withDebugComment?: boolean;
    commentLinePrefix: string;
    generateProfile?: boolean;
};

type CSharpGeneratorOptions = WriterOptions & {
    outputDir: string;
    staticSourceDir?: string;
    rootNamespace: string;
};

/**
 * proc-ts TypeScript generator
 *
 * Generates flat TypeScript files named $type_<Name>.ts so they're picked up
 * by the procedural project scanner ($type_-prefix → kind: "type" → global).
 * All type references use `types.fhir.*` global namespace.
 * Resource types get `export default function isX` type guard.
 * Data types are type-only (no default export).
 */

type ProcTsOptions = {
    lineWidth?: number;
    /** Prefix for type references, e.g. "types.fhir" */
    typePrefix?: string;
} & WriterOptions;

type StringFormatKey = "snake_case" | "PascalCase" | "camelCase";
interface PythonGeneratorOptions extends WriterOptions {
    allowExtraFields?: boolean;
    primitiveTypeExtension?: boolean;
    rootPackageName: string;
    fieldFormat: StringFormatKey;
    fhirpyClient?: boolean;
}

interface IntrospectionWriterOptions extends FileSystemWriterOptions {
    typeSchemas?: string /** if .ndjson -- put in one file, else -- split into separated files*/;
    typeTree?: string /** .json or .yaml file */;
    fhirSchemas?: string /** if .ndjson -- put in one file, else -- split into separated files*/;
    structureDefinitions?: string /** if .ndjson -- put in one file, else -- split into separated files*/;
}

interface IrReportWriterWriterOptions extends FileSystemWriterOptions {
    rootReadmeFileName: string;
}

type NameTransformation = {
    pattern: RegExp | string;
    format: string;
};
type DistinctNameConfigurationType<T> = {
    common: T;
    enumValue: T;
    type: T;
    field: T;
};

type FilterType = {
    whitelist?: (string | RegExp)[];
    blacklist?: (string | RegExp)[];
};
type HookType = {
    cmd: string;
    args?: string[];
};
declare const PRIMITIVE_TYPES: readonly ["boolean", "instant", "time", "date", "dateTime", "decimal", "integer", "unsignedInt", "positiveInt", "integer64", "base64Binary", "uri", "url", "canonical", "oid", "uuid", "string", "code", "markdown", "id", "xhtml"];
type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];
type Rendering = {
    source: string;
    fileNameFormat: string;
    path: string;
    filter?: FilterType;
    properties?: Record<string, any>;
};

type FileBasedMustacheGeneratorOptions = {
    debug: "OFF" | "FORMATTED" | "COMPACT";
    meta: {
        timestamp?: string;
        generator?: string;
    };
    renderings: {
        utility: Rendering[];
        resource: Rendering[];
        complexType: Rendering[];
    };
    keywords: string[];
    primitiveTypeMap: Partial<Record<PrimitiveType, string>>;
    nameTransformations: DistinctNameConfigurationType<NameTransformation[]>;
    unsaveCharacterPattern: string | RegExp;
    shouldRunHooks: boolean;
    hooks: {
        afterGenerate?: HookType[];
    };
};

type TypeScriptOptions = {
    lineWidth?: number;
    /** openResourceTypeSet -- for resource families (Resource, DomainResource) use open set for resourceType field.
     *
     * - when openResourceTypeSet is false: `type Resource = { resourceType: "Resource" | "DomainResource" | "Patient" }`
     * - when openResourceTypeSet is true: `type Resource = { resourceType: "Resource" | "DomainResource" | "Patient" | string }`
     */
    openResourceTypeSet: boolean;
    primitiveTypeExtension: boolean;
    extensionGetterDefault?: "flat" | "profile" | "raw";
    sliceGetterDefault?: "flat" | "raw";
} & WriterOptions;

/**
 * High-Level API Builder
 *
 * Provides a fluent, chainable API for common codegen use cases with pre-built generators.
 * This builder pattern allows users to configure generation in a declarative way.
 */

/**
 * Configuration options for the API builder
 */
interface APIBuilderOptions {
    outputDir: string;
    cleanOutput: boolean;
    throwException: boolean;
    typeSchema?: IrConf;
    /** Custom FHIR package registry URL (default: https://fs.get-ig.org/pkgs/) */
    registry: string | undefined;
    /** Drop the canonical manager cache */
    dropCanonicalManagerCache: boolean;
}
type GenerationReport = {
    success: boolean;
    outputDir: string;
    filesGenerated: Record<string, string>;
    errors: string[];
    warnings: string[];
    duration: number;
};
declare const prettyReport: (report: GenerationReport) => string;
interface LocalStructureDefinitionConfig {
    package: PackageMeta;
    path: string;
    dependencies?: PackageMeta[];
}
/**
 * High-Level API Builder class
 *
 * Provides a fluent interface for configuring and executing code generation
 * from FHIR packages or TypeSchema documents.
 */
declare class APIBuilder {
    private options;
    private manager;
    private prebuiltRegister;
    private managerInput;
    private logger;
    private generators;
    constructor(userOpts?: Partial<APIBuilderOptions> & {
        manager?: ReturnType<typeof CanonicalManager>;
        register?: Register;
        preprocessPackage?: (context: PreprocessContext) => PreprocessContext;
        logger?: CodegenLogManager;
    });
    fromPackage(packageName: string, version?: string): APIBuilder;
    fromPackageRef(packageRef: string): APIBuilder;
    localStructureDefinitions(config: LocalStructureDefinitionConfig): APIBuilder;
    localTgzPackage(archivePath: string): APIBuilder;
    introspection(userOpts?: Partial<IntrospectionWriterOptions>): APIBuilder;
    typescript(userOpts: Partial<TypeScriptOptions>): this;
    procTs(userOpts?: Partial<ProcTsOptions>): this;
    python(userOptions: Partial<PythonGeneratorOptions>): APIBuilder;
    mustache(templatePath: string, userOpts: Partial<FileSystemWriterOptions & FileBasedMustacheGeneratorOptions>): this;
    csharp(userOptions: Partial<CSharpGeneratorOptions>): APIBuilder;
    /**
     * Set the output directory for all generators
     */
    outputTo(directory: string): APIBuilder;
    throwException(enabled?: boolean): APIBuilder;
    cleanOutput(enabled?: boolean): APIBuilder;
    typeSchema(cfg: IrConf): this;
    irReport(userOpts: Partial<IrReportWriterWriterOptions>): this;
    generate(): Promise<GenerationReport>;
    /**
     * Clear all configuration and start fresh
     */
    reset(): APIBuilder;
    /**
     * Get configured generators (for inspection)
     */
    getGenerators(): string[];
    private executeGenerators;
}

export { APIBuilder, type APIBuilderOptions, type CSharpGeneratorOptions, type CodegenLog, type CodegenLogManager, type CodegenTag, type IrConf, type LocalStructureDefinitionConfig, type LogLevel, type LogicalPromotionConf, type ProcTsOptions, type TreeShakeConf, type TypeScriptOptions, mkCodegenLogger, prettyReport, registerFromManager, registerFromPackageMetas };
