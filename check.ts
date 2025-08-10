import FHIRClient from "./generated/client/fhirclient";

const client = new FHIRClient("", {});

const patientResults = await client.search("Patient", {
	gender: "male",
	"address-city": "New York",
});
