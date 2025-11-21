package de.solutio.fhir.models.resources;
import static de.solutio.fhir.models.complex_types.CodeableConceptDTO.codeableConceptDtoBuilder;
import static de.solutio.fhir.models.complex_types.ElementDTO.elementDtoBuilder;
import static de.solutio.fhir.models.complex_types.ExtensionDTO.extensionDtoBuilder;
import static de.solutio.fhir.models.complex_types.ReferenceDTO.referenceDtoBuilder;
import static de.solutio.fhir.models.resources.TaskDTO.TaskInputDTO.taskInputDtoBuilder;
import static de.solutio.fhir.models.resources.TaskDTO.TaskIntentDTO;
import static de.solutio.fhir.models.resources.TaskDTO.TaskStatusDTO;
import static de.solutio.fhir.models.resources.TaskDTO.taskDtoBuilder;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import de.solutio.fhir.models.ResourceName;
import de.solutio.fhir.models.complex_types.ReferenceDTO;
import java.net.URI;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
class ResourceTest {
    @Test
    public void test() throws JsonProcessingException {
        final ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.findAndRegisterModules();
        final TaskDTO task = taskDtoBuilder()
                .description("some description")
                .requester(referenceDtoBuilder().reference("123").type(URI.create("Practitioner")).build())
                .forReference(referenceDtoBuilder().reference("Patient/123").build())
                .addInsurance(referenceDtoBuilder().reference(ResourceName.ORGANIZATION_DTO, "123").build())
                .addBasedOn(referenceDtoBuilder().reference(ResourceName.TASK_DTO, UUID.randomUUID()).build())
                .authoredOn(
                        LocalDateTime.now(),
                        elementDtoBuilder()
                                .extension(
                                        extensionDtoBuilder().url(URI.create("https://www.google.com")).build())
                                .build())
                .intent(TaskIntentDTO.PLAN)
                .status(TaskStatusDTO.REQUESTED)
                .input(taskInputDtoBuilder().type(codeableConceptDtoBuilder().build()).build())
                .build();
        assertThat(task.toString()).isNotBlank();
        final String json = objectMapper.writeValueAsString(task);
        assertThat(json).isNotBlank();
        final TaskDTO read = objectMapper.readValue(json, TaskDTO.class);
        assertThat(read).isEqualTo(task);
        assertThat(read.toString()).isNotBlank();
        final TaskDTO taskWithExtension = task.toBuilder()
                ._description(
                        elementDtoBuilder()
                                .extension(
                                        extensionDtoBuilder().url(URI.create("https://www.google.com")).build())
                                .build())
                .extension(extensionDtoBuilder().url(URI.create("https://www.google.com")).build())
                .build();
        assertThat(taskWithExtension.description()).isEqualTo(task.description());
        assertThat(taskWithExtension.intent()).isEqualTo(task.intent());
        assertThat(taskWithExtension.status()).isEqualTo(task.status());
        assertThat(taskWithExtension.toString()).isNotBlank();
        final String jsonWithExtension = objectMapper.writeValueAsString(taskWithExtension);
        final TaskDTO readWithExtension = objectMapper.readValue(jsonWithExtension, TaskDTO.class);
        assertThat(readWithExtension).isEqualTo(taskWithExtension);
        assertThat(readWithExtension.toString()).isNotBlank();
        assertThat(readWithExtension.forReference().flatMap(ReferenceDTO::findReferencedResourceName)).hasValue(ResourceName.PATIENT_DTO);
        assertThat(readWithExtension.requester().flatMap(ReferenceDTO::findReferencedResourceName)).hasValue(ResourceName.PRACTITIONER_DTO);
        assertThat(readWithExtension.insurance().map(List::getFirst).flatMap(ReferenceDTO::findReferencedResourceName)).hasValue(ResourceName.ORGANIZATION_DTO);
        assertThat(readWithExtension.basedOn().map(List::getFirst).flatMap(ReferenceDTO::findReferencedResourceName)).hasValue(ResourceName.TASK_DTO);
    }
}