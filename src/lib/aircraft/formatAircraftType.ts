export interface AircraftTypeInfo {
	designator: string;
	make: string;
	model: string;
}

export function formatAircraftType(type: AircraftTypeInfo | undefined): string {
	if (!type) return '--';
	return `${type.designator} - ${type.make} ${type.model}`;
}
