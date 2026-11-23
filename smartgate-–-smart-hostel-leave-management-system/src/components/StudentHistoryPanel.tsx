import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api';
import { useToast } from '../context/ToastContext';
import { DataTable, type ColumnDef } from './DataTable';
import { LoadingSkeleton } from './LoadingSkeleton';

interface StudentHistoryRow {
  _id: string;
  name: string;
  email: string;
  usn: string;
  department: string;
  semester: number;
  section: string;
  hostelBlock: string;
  roomNumber: string;
  parentPhone: string;
  regularLeavesCount: number;
  emergencyLeavesCount: number;
  approvedRegularDaysInSem: number;
}

export function StudentHistoryPanel() {
  const { showToast } = useToast();
  const [students, setStudents] = useState<StudentHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiRequest<{ students: StudentHistoryRow[] }>('/dashboard/students-history');
        setStudents(data.students);
      } catch (err) {
        showToast((err as Error).message, 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <LoadingSkeleton rows={5} />;

  const columns: ColumnDef<StudentHistoryRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div>
          <div className="font-semibold text-slate-900">{r.name}</div>
          <div className="text-xs font-mono text-slate-500">{r.usn}</div>
        </div>
      ),
    },
    {
      key: 'academic',
      header: 'Department & Sem',
      render: (r) => (
        <span className="text-xs text-slate-700">
          {r.department} · Sem {r.semester} · Sec {r.section}
        </span>
      ),
    },
    {
      key: 'hostel',
      header: 'Hostel',
      render: (r) => (
        <span className="text-xs text-slate-600">
          {r.hostelBlock} · {r.roomNumber}
        </span>
      ),
    },
    {
      key: 'days',
      header: 'Approved Reg. Days (Sem)',
      align: 'right',
      render: (r) => (
        <span
          className={`font-mono font-semibold tabular-nums ${
            r.approvedRegularDaysInSem > 5 ? 'text-amber-700' : 'text-slate-900'
          }`}
        >
          {r.approvedRegularDaysInSem} d {r.approvedRegularDaysInSem > 5 ? '(HOD Req)' : ''}
        </span>
      ),
    },
    {
      key: 'counts',
      header: 'Total Leaves',
      align: 'right',
      render: (r) => (
        <span className="text-xs tabular-nums text-slate-700">
          {r.regularLeavesCount} Reg · {r.emergencyLeavesCount} Emg
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Student Leave History</h2>
        <p className="text-sm text-slate-500">
          Semester regular leave day totals (used for conditional HOD routing above 5 days).
        </p>
      </div>
      <DataTable
        data={students}
        columns={columns}
        keyExtractor={(r) => r._id}
        searchPlaceholder="Search student by name, USN, or department..."
        searchFilter={(r, q) =>
          r.name.toLowerCase().includes(q) ||
          r.usn.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q)
        }
        emptyTitle="No student records found"
        emptyDescription="Students registered in SmartGate will appear here."
      />
    </div>
  );
}
