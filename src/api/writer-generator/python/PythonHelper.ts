import type {Identifier} from '@root/typeschema';
import type { Python } from './python';
import type {RegularTypeSchema} from "@typeschema/types.ts";
import {resourceRelatives} from "@typeschema/utils.ts";

export type TypeRefType =
    | 'resource'
    | 'nested'
    | 'constraint'
    | 'logical'
    | 'complex-type'
    | 'primitive-type'
    | 'valueset'
    | 'choice'
    | 'unknown';

export interface TypeRef {
    name: string;
    package: string;
    kind: TypeRefType;
    version: string;
    url: string;
}

export class PythonHelper {
    private resourceHierarchy: { parent: Identifier; child: Identifier }[] | null = [];

    constructor() {
        this.resourceHierarchy = null;
    }

    evaluateResourceHierarchy(resources: RegularTypeSchema[]) {
        const pairs: { parent: Identifier; child: Identifier }[] = [];
        for (const schema of resources) {
            if (schema.base) {
                pairs.push({ parent: schema.base, child: schema.identifier });
            }
        }
        return pairs;
    }

    childrenOf(schemaRef: Identifier, resources :RegularTypeSchema[]): Identifier[] {
        if (!this.resourceHierarchy) {
            this.resourceHierarchy = this.evaluateResourceHierarchy(resources);
        }
        const childrens = this.resourceHierarchy
            .filter((pair) => pair.parent.name === schemaRef.name)
            .map((pair) => pair.child);
        const subChildrens = childrens.flatMap((child) => this.childrenOf(child, resources));
        return [...[...childrens].map((child) => child), ...subChildrens];
    }

    getPackages(packageResources: RegularTypeSchema[], rootPackage: string): string[] {
        const packages: string[] = [];
        for (const resource of packageResources) {
            const resource_name: string = `${rootPackage}.${resource.identifier.package.replaceAll('.', '_')}`;
            if (!packages.includes(resource_name)) packages.push(resource_name);
        }
        return packages;
    }

    getFamilies(packageResources: RegularTypeSchema[]): Record<string, string[]> {
        const families: Record<string, string[]> = {};
        for (const resource of packageResources) {
            const resources: string[] = this.childrenOf(resource.identifier, packageResources).map(
                (c: { name: string }) => c.name,
            );
            if (resources.length > 0) {
                const familyName = `${resource.identifier.name}Family`;
                families[familyName] = resources;
            }
        }
        return families;
    }

    sortSchemasByDeps(schemas: RegularTypeSchema[]): RegularTypeSchema[] {
        const graph = this.buildDependencyGraph(schemas);
        const sorted = this.topologicalSort(graph);
        return sorted
            .map((name) => schemas.find((schema) => schema.identifier.name === name))
            .filter(Boolean) as RegularTypeSchema[];
    };

    buildDependencyGraph(schemas: RegularTypeSchema[]): Record<string, string[]> {
        const nameToMap: Record<string, RegularTypeSchema> = {};
        for (const schema of schemas) {
            nameToMap[schema.identifier.name] = schema;
        }

        const graph: Record<string, string[]> = {};
        for (const schema of schemas) {
            const name = schema.identifier.name;
            const base = schema.base?.name;
            if (!graph[name]) {
                graph[name] = [];
            }
            if (base && nameToMap[base]) {
                graph[name].push(base);
            }
        }
        return graph;
    };

    topologicalSort (graph: Record<string, string[]>): string[] {
        const sorted: string[] = [];
        const visited: Record<string, boolean> = {};
        const temp: Record<string, boolean> = {};

        const visit = (node: string) => {
            if (temp[node]) {
                throw new Error(`Graph has cycles ${node}`);
            }
            if (!visited[node]) {
                temp[node] = true;
                for (const neighbor of graph[node] ?? []) {
                    visit(neighbor);
                }
                temp[node] = false;
                visited[node] = true;
                sorted.push(node);
            }
        };

        for (const node in graph) {
            if (!visited[node]) {
                visit(node);
            }
        }
        return sorted;
    }
}
