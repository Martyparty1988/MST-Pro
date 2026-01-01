
import React, { useState } from 'react';
import FieldPlan from './FieldPlan';
import TableModal from './TableModal';
import TimeRecordForm from './TimeRecordForm';
import type { FieldTable } from '../types';

interface FieldPlanViewProps {
    projectId: number;
}

/**
 * Wrapper komponenta pro plánové pole
 * Spojuje FieldPlan (vizualizace), TableModal (detail) a TimeRecordForm (zápis práce)
 */
const FieldPlanView: React.FC<FieldPlanViewProps> = ({ projectId }) => {
    const [selectedTable, setSelectedTable] = useState<FieldTable | null>(null);
    const [showWorkLog, setShowWorkLog] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const handleTableClick = (table: FieldTable) => {
        setSelectedTable(table);
    };

    const handleCloseModal = () => {
        setSelectedTable(null);
    };

    const handleLogWorkRequest = (table: FieldTable) => {
        // Ponecháme selectedTable pro pre-fill, ale otevřeme formulář práce
        setShowWorkLog(true);
    };

    const handleUpdate = () => {
        setRefreshKey(prev => prev + 1);
    };

    return (
        <>
            <FieldPlan
                key={refreshKey}
                projectId={projectId}
                onTableClick={handleTableClick}
            />

            {selectedTable && !showWorkLog && (
                <TableModal
                    table={selectedTable}
                    onClose={handleCloseModal}
                    onUpdate={handleUpdate}
                    onLogWork={handleLogWorkRequest}
                />
            )}

            {showWorkLog && (
                <TimeRecordForm
                    onClose={() => {
                        setShowWorkLog(false);
                        setSelectedTable(null);
                        handleUpdate();
                    }}
                    initialProjectId={projectId}
                    initialTableIds={selectedTable ? [selectedTable.tableId] : undefined}
                />
            )}
        </>
    );
};

export default FieldPlanView;
