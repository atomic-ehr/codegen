using CSharpSDK.Client;
using NUnit.Framework;
using Task = System.Threading.Tasks.Task;

namespace csharp
{
    [TestFixture]
    public class PatientTests
    {
        private const string FhirServerUrl = "http://localhost:8080/fhir";
        private const string Username = "root";
        private const string Password = "<SECRET>"; // get actual value from docker-compose.yaml: BOX_ROOT_CLIENT_SECRET

        private Client? _client;
        private Patient? _createdPatient;

        [OneTimeSetUp]
        public void OneTimeSetUp()
        {
            Console.WriteLine("=== FHIR Patient Tests Setup ===");
            Console.WriteLine($"Connecting to FHIR Server: {FhirServerUrl}");
            Console.WriteLine($"Username: {Username}");
            
            _client = new Client(
                url: FhirServerUrl,
                auth: new Auth
                {
                    Method = AuthMethods.BASIC,
                    Credentials = new AuthCredentials
                    {
                        Username = Username,
                        Password = Password
                    }
                }
            );
            
            Console.WriteLine("Client initialized successfully");
            Console.WriteLine("=================================\n");
        }

        [SetUp]
        public async Task SetUp()
        {
            Console.WriteLine("--- Test Setup: Creating base patient ---");
            
            var patient = new Patient
            {
                Name = 
                [
                    new HumanName
                    {
                        Given = ["Test"],
                        Family = "Patient"
                    }
                ],
                Gender = AdministrativeGenderEnum.Female,
                BirthDate = "1980-01-01"
            };

            var strings = patient.Name.First().Given;
            if (strings != null)
                Console.WriteLine(
                    $"Creating patient: {strings.First()} {patient.Name.First().Family}");
            Console.WriteLine($"Gender: {patient.Gender}, Birth Date: {patient.BirthDate}");
            
            var (createdPatient, error) = await Task.Run(() => _client!.Create(patient));
            Assert.That(error, Is.Null, $"Failed to create patient: {error}");
            _createdPatient = createdPatient;
            
            Console.WriteLine($"Base patient created successfully with ID: {_createdPatient?.Id}");
            Console.WriteLine("--------------------------------------------\n");
        }

        [TearDown]
        public async Task TearDown()
        {
            Console.WriteLine("--- Test Cleanup ---");
            
            try
            {
                if (_createdPatient?.Id != null)
                {
                    Console.WriteLine($"Cleaning up patient with ID: {_createdPatient.Id}");
                    await Task.Run(() => _client!.Delete<Patient>(_createdPatient.Id));
                    Console.WriteLine("Cleanup completed successfully");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Cleanup error (ignored): {ex.Message}");
            }
            
            Console.WriteLine("--------------------\n");
        }

        [Test]
        public async Task TestCreatePatient()
        {
            Console.WriteLine(" TEST: Create Patient");
            Console.WriteLine("========================");
            
            var newPatient = new Patient
            {
                Name =
                [
                    new HumanName
                    {
                        Given = ["Create"],
                        Family = "Test"
                    }
                ],
                Gender = AdministrativeGenderEnum.Female,
                BirthDate = "1980-01-01"
            };

            var strings = newPatient.Name.First().Given;
            if (strings != null)
            {
                Console.WriteLine(
                    $"Creating new patient: {strings.First()} {newPatient.Name.First().Family}");

                var created = _client!.Create(newPatient).Result.result!;

                Console.WriteLine(" Patient created successfully!");
                Console.WriteLine($"   ID: {created.Id}");
                Console.WriteLine($"   Name: {created.Name?.First().Given?.First()} {created.Name?.First().Family}");
                Console.WriteLine($"   Gender: {created.Gender}");
                Console.WriteLine($"   Birth Date: {created.BirthDate}");

                Assert.That(created.Id, Is.Not.Null);
                Assert.That(created.Name, Is.Not.Null);
                Assert.That(created.Name!.First().Family, Is.EqualTo("Test"));
                Assert.That(created.Gender, Is.EqualTo(AdministrativeGenderEnum.Female));
                Assert.That(created.BirthDate, Is.EqualTo("1980-01-01"));

                if (created.Id != null)
                {
                    Console.WriteLine($"Cleaning up test patient: {created.Id}");
                    await _client.Delete<Patient>(created.Id);
                }
            }

            Console.WriteLine("========================\n");
        }

        [Test]
        public void TestReadPatient()
        {
            Console.WriteLine(" TEST: Read Patient");
            Console.WriteLine("=====================");
            
            Assert.That(_createdPatient!.Name, Is.Not.Null);
            Assert.That(_createdPatient.Id, Is.Not.Null);
            
            Console.WriteLine($"Reading patient with ID: {_createdPatient.Id}");
            
            var readPatient = _client!.Read<Patient>(_createdPatient.Id!).Result.result!;

            Console.WriteLine(" Patient read successfully!");
            Console.WriteLine($"   Original ID: {_createdPatient.Id}");
            Console.WriteLine($"   Read ID: {readPatient.Id}");
            Console.WriteLine($"   Name: {readPatient.Name?.First().Given?.First()} {readPatient.Name?.First().Family}");
            Console.WriteLine($"   Gender: {readPatient.Gender}");

            Assert.That(readPatient.Id, Is.EqualTo(_createdPatient.Id));
            Assert.That(readPatient.Name, Is.Not.Null);
            Assert.That(readPatient.Name!.First().Family, Is.EqualTo(_createdPatient.Name!.First().Family));
            Assert.That(readPatient.Gender, Is.EqualTo(_createdPatient.Gender));
            
            Console.WriteLine("=====================\n");
        }

        [Test]
        public void TestUpdatePatient()
        {
            Console.WriteLine(" TEST: Update Patient");
            Console.WriteLine("=======================");
            
            Assert.That(_createdPatient!.Id, Is.Not.Null);
            var patientToUpdate = _client!.Read<Patient>(_createdPatient.Id!).Result.result;

            Console.WriteLine("Original patient data:");
            Console.WriteLine($"   ID: {patientToUpdate!.Id}");
            Console.WriteLine($"   Name: {patientToUpdate.Name?.First().Given?.First()} {patientToUpdate.Name?.First().Family}");
            Console.WriteLine($"   Gender: {patientToUpdate.Gender}");

            Assert.That(patientToUpdate.Id, Is.EqualTo(_createdPatient.Id));
            Assert.That(patientToUpdate.Gender, Is.EqualTo(AdministrativeGenderEnum.Female));
            Assert.That(patientToUpdate.Name, Is.Not.Null);
            Assert.That(patientToUpdate.Name!.First().Family, Is.EqualTo("Patient"));

            Console.WriteLine("\nUpdating patient data...");
            patientToUpdate.Name!.First().Family = "UpdatedFamily";
            patientToUpdate.Name!.First().Given = ["UpdatedGiven"];
            patientToUpdate.Gender = AdministrativeGenderEnum.Male;
            
            var updatedPatient = _client.Update(patientToUpdate).Result.result!;

            Console.WriteLine(" Patient updated successfully!");
            Console.WriteLine($"   ID: {updatedPatient.Id}");
            Console.WriteLine($"   Updated Name: {updatedPatient.Name?.First().Given?.First()} {updatedPatient.Name?.First().Family}");
            Console.WriteLine($"   Updated Gender: {updatedPatient.Gender}");

            Assert.That(updatedPatient.Id, Is.EqualTo(_createdPatient.Id)); 
            Assert.That(updatedPatient.Gender, Is.EqualTo(AdministrativeGenderEnum.Male)); 
            Assert.That(updatedPatient.Name, Is.Not.Null);
            Assert.That(updatedPatient.Name!.First().Family, Is.EqualTo("UpdatedFamily")); 
            Assert.That(updatedPatient.Name!.First().Given!.First(), Is.EqualTo("UpdatedGiven"));

            Console.WriteLine("\nVerifying update by re-reading patient...");
            Assert.That(_createdPatient.Id, Is.Not.Null);
            var reReadPatient = _client.Read<Patient>(_createdPatient.Id!).Result.result!;
            
            Console.WriteLine(" Verification successful!");
            Console.WriteLine($"   Re-read Name: {reReadPatient.Name?.First().Given?.First()} {reReadPatient.Name?.First().Family}");
            Console.WriteLine($"   Re-read Gender: {reReadPatient.Gender}");
            
            Assert.That(reReadPatient.Gender, Is.EqualTo(AdministrativeGenderEnum.Male));
            Assert.That(reReadPatient.Name, Is.Not.Null);
            Assert.That(reReadPatient.Name!.First().Family, Is.EqualTo("UpdatedFamily"));
            Assert.That(reReadPatient.Name!.First().Given!.First(), Is.EqualTo("UpdatedGiven"));
            
            Console.WriteLine("=======================\n");
        }

        [Test]
        public void TestSearchPatient()
        {
            Console.WriteLine(" TEST: Search Patient");
            Console.WriteLine("=======================");
            
            Console.WriteLine("Searching for patients with name='Patient'");
            Console.WriteLine($"Looking for patient with ID: {_createdPatient!.Id}");
            
            var resultBundle = _client!.Search<Patient>("name=Patient").Result.result!;

            Console.WriteLine(" Search completed!");
            Console.WriteLine($"   Total results: {resultBundle.Total}");
            Console.WriteLine($"   Entry count: {resultBundle.Entry?.Length ?? 0}");

            Assert.That(resultBundle, Is.Not.Null);
            Assert.That(resultBundle.Total, Is.Not.Null);
            Assert.That(resultBundle.Total, Is.GreaterThan(0), "No patients found in search");

            Assert.That(resultBundle.Entry, Is.Not.Null);
            var found = false;
            
            Console.WriteLine("\nSearching through results:");
            foreach (var entry in resultBundle.Entry ?? [])
            {
                Assert.That(entry.Resource, Is.Not.Null);
                var patientName = entry.Resource?.Name?.FirstOrDefault();
                var fullName = $"{patientName?.Given?.FirstOrDefault()} {patientName?.Family}";
                
                Console.WriteLine($"   Found patient: ID={entry.Resource!.Id}, Name={fullName}");
                
                if (entry.Resource.Id == _createdPatient.Id)
                {
                    Console.WriteLine("    Found target patient!");
                    Console.WriteLine(entry.Resource.ToString());
                    found = true;
                    break;
                }
            }

            Assert.That(found, Is.True, $"Patient with ID {_createdPatient!.Id} not found in search results");
            Console.WriteLine("=======================\n");
        }

        [Test]
        public Task TestDeletePatient()
        {
            Console.WriteLine(" TEST: Delete Patient");
            Console.WriteLine("=======================");
            
            var deletePatient = new Patient
            {
                Name =
                [
                    new HumanName
                    {
                        Given = ["Delete"],
                        Family = "Test"
                    }
                ],
                Gender = AdministrativeGenderEnum.Unknown
            };

            var strings = deletePatient.Name.First().Given;
            if (strings  != null)
                Console.WriteLine(
                    $"Creating patient to delete: {strings .First()} {deletePatient.Name.First().Family}");

            var (created, createError) = _client!.Create(deletePatient).Result;
            Assert.That(createError, Is.Null, $"Create operation failed: {createError}");
            Assert.That(created, Is.Not.Null);
            Assert.That(created!.Id, Is.Not.Null);
            
            Console.WriteLine($" Patient created with ID: {created.Id}");
            Console.WriteLine("Now deleting patient...");
            
            var deleteError = _client.Delete<Patient>(created.Id!).Result.error;
            Assert.That(deleteError, Is.Null, $"Delete operation failed: {deleteError}");

            Console.WriteLine(" Patient deleted successfully!");
            Console.WriteLine("Verifying deletion by attempting to read...");

            var (deletedPatient, readError) = _client.Read<Patient>(created.Id!).Result;
            
            Console.WriteLine(" Verification successful - patient cannot be read after deletion");
            Console.WriteLine($"   Read error (expected): {readError?.GetType().Name}");
            
            Assert.That(readError, Is.Not.Null, "Reading deleted patient should return an error");
            Assert.That(deletedPatient, Is.Null);
            
            Console.WriteLine("=======================\n");
            return Task.CompletedTask;
        }
        
        [Test]
        public void TestJsonSerialization()
        {
            Console.WriteLine(" TEST: JSON Serialization");
            Console.WriteLine("============================");
            
            var patient = new Patient
            {
                Id = "123",
                Name =
                [
                    new HumanName
                    {
                        Given = ["JsonTest"],
                        Family = "Serialization"
                    }
                ],
                Gender = AdministrativeGenderEnum.Female,
                BirthDate = "1990-05-15"
            };

            Console.WriteLine("Original patient:");
            var strings = patient.Name.First().Given;
            if (strings != null)
            {
                Console.WriteLine($"   Name: {strings.First()} {patient.Name.First().Family}");
                Console.WriteLine($"   Gender: {patient.Gender}");
                Console.WriteLine($"   Birth Date: {patient.BirthDate}");

                var json = patient.ToString();
                Console.WriteLine("\nSerialized JSON:");
                Console.WriteLine(json);

                var deserializedPatient =
                    JsonSerializer.Deserialize<Patient>(json, Helper.JsonSerializerOptions)!;

                Console.WriteLine("\n Deserialization successful!");
                Console.WriteLine(
                    $"   Name: {deserializedPatient.Name?.First().Given?.First()} {deserializedPatient.Name?.First().Family}");
                Console.WriteLine($"   Gender: {deserializedPatient.Gender}");
                Console.WriteLine($"   Birth Date: {deserializedPatient.BirthDate}");

                Assert.That(deserializedPatient, Is.Not.Null);
                Assert.That(deserializedPatient.Name, Is.Not.Null);
                Assert.That(deserializedPatient.Name!.First().Family, Is.EqualTo("Serialization"));
                Assert.That(deserializedPatient.Name!.First().Given!.First(), Is.EqualTo("JsonTest"));
                Assert.That(deserializedPatient.Gender, Is.EqualTo(AdministrativeGenderEnum.Female));
                Assert.That(deserializedPatient.BirthDate, Is.EqualTo("1990-05-15"));

                Console.WriteLine("\n JSON format validation:");
                Console.WriteLine($"   Contains 'birthDate': {json.Contains("\"birthDate\"")}");
                Console.WriteLine($"   Contains 'gender': {json.Contains("\"gender\"")}");
                Console.WriteLine($"   Does NOT contain 'BirthDate': {!json.Contains("\"BirthDate\"")}");

                Assert.That(json, Does.Contain("\"birthDate\""));
                Assert.That(json, Does.Contain("\"gender\""));
                Assert.That(json, Does.Not.Contain("\"BirthDate\""));
            }

            Console.WriteLine("============================\n");
        }

        [Test]
        public void TestResourceMapping()
        {
            Console.WriteLine(" TEST: Resource Mapping");
            Console.WriteLine("=========================");
            
            var patientType = typeof(Patient);
            Console.WriteLine($"Testing resource mapping for type: {patientType.Name}");
            
            var hasMapping = Helper.ResourceMap.TryGetValue(patientType, out var resourceName);

            Console.WriteLine(" Resource mapping result:");
            Console.WriteLine($"   Has mapping: {hasMapping}");
            Console.WriteLine($"   Resource name: {resourceName}");

            Assert.That(hasMapping, Is.True, "Patient type should be mapped in ResourceDictionary");
            Assert.That(resourceName, Is.EqualTo("Patient"));
            
            Console.WriteLine("=========================\n");
        }
        
        [Test]
        public void TestEnumFields()
        {
            Console.WriteLine(" TEST: Enum Fields");
            Console.WriteLine("=========================");
            
            var practitioner = new Practitioner()
            {
                Name = 
                [
                    new HumanName
                    {
                        Given = ["Practitioner"],
                        Family = "EnumTest"
                    }
                ],
                Gender = AdministrativeGenderEnum.Female,
                BirthDate = "1980-01-01"
            };
            
            var patient = new Patient
            {
                Id = "123",
                Name =
                [
                    new HumanName
                    {
                        Given = ["Patient"],
                        Family = "EnumTest"
                    }
                ],
                Gender = AdministrativeGenderEnum.Female,
                BirthDate = "1990-05-15"
            };
            
            Console.WriteLine("Testing enum field definitions");

            Assert.That( practitioner.Gender == patient.Gender, "Wrong enum fields definition");
            
            Console.WriteLine("=========================\n");
        }
        
    }
}