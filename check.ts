import FHIRClient from "./generated/client/fhirclient";

const client = new FHIRClient("", {});

const patientResults = await client.search("Patient", {
	name: { contains: "Smith" }, // String modifier
	gender: "male",
	birthdate: { ge: "1990-01-01" }, // Date range search
	active: "true", // Boolean parameter
	organization: "Organization/123", // Reference parameter
	_include: ["Patient:organization"], // Typed include options
	_sort: ["-birthdate", "family"], // Multiple sort fields
	_count: 50, // Validated count
});
