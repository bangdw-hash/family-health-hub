import React from 'react';
import {useApp} from '../state.js';
import {PatientForm, AppointmentForm, RecordForm, MedicationForm, AttachmentForm, PermissionSheet} from './forms.jsx';
import {Sheet} from './ui.jsx';
import ReportSheet from './ReportSheet.jsx';
import {live} from './cards.jsx';
import {Users, CalendarPlus, FileText, Pill, Paperclip} from 'lucide-react';
import {compressImage, MAX_UPLOAD_BYTES} from '../lib/image.js';
import {eul} from '../lib/format.js';

/** 모든 입력/조회 시트를 한 곳에서 관리합니다. */
export default function Sheets() {
  const app = useApp(), {sheet, api, data, members, patients, creatable, isOwner, can, trashItem, nav, toast, canAddPatient} = app;
  const cur = sheet.current;
  if (!cur) return null;
  const {type, ...p} = cur, close = sheet.close;
  const ok = (text) => toast(text);
  const save = (table, label) => async payload => {
    if (p.initial) { await api.update(table, p.initial.id, payload); ok(eul(label) + ' 수정했습니다.'); }
    else { const id = await api.insert(table, payload); ok(eul(label) + ' 등록했습니다.'); return id; }
  };
  const del = (table, label, name) => p.initial && can(p.initial.patient_id, 'edit') ? async () => { close(); await trashItem(table, p.initial.id, name || label); } : undefined;

  if (type === 'quick') return <Sheet title="무엇을 추가하시겠습니까?" onClose={close} size="sm">
    <div className="quick">
      {canAddPatient && <button type="button" onClick={() => sheet.open('patient', {})}><Users size={22}/> 환자 등록</button>}
      {creatable.length > 0 ? <>
        <button type="button" onClick={() => sheet.open('appt', {defaultPatient: p.defaultPatient, defaultDate: p.defaultDate})}><CalendarPlus size={22}/> 진료 일정</button>
        <button type="button" onClick={() => sheet.open('record', {defaultPatient: p.defaultPatient})}><FileText size={22}/> 진료 기록</button>
        <button type="button" onClick={() => sheet.open('med', {defaultPatient: p.defaultPatient})}><Pill size={22}/> 복약 계획</button>
        <button type="button" onClick={() => sheet.open('attach', {defaultPatient: p.defaultPatient})}><Paperclip size={22}/> 파일 첨부</button></>
        : <p className="muted">등록 가능한 환자가 없습니다. {canAddPatient ? '먼저 환자를 등록하십시오.' : '관리자에게 환자 등록 또는 권한 부여를 요청하십시오.'}</p>}
    </div></Sheet>;

  if (type === 'patient') {
    const onSave = async payload => {
      if (p.initial) { await api.update('patients', p.initial.id, payload); ok('환자 정보를 수정했습니다.'); }
      else { const id = await api.insert('patients', payload); ok('환자를 등록했습니다.'); nav.go({tab: 'patients', patientId: id, ptab: 'appts'}); }
    };
    return <PatientForm initial={p.initial} isOwner={isOwner} onSave={onSave} onClose={close}
      readOnly={p.initial && !can(p.initial.id, 'edit')}
      onDelete={p.initial && isOwner ? async () => { close(); nav.go({patientId: null}, {replace: true}); await trashItem('patients', p.initial.id, p.initial.name); } : undefined}/>;
  }
  if (type === 'appt') return <AppointmentForm initial={p.initial} readOnly={p.initial && !can(p.initial.patient_id, 'edit')} patients={creatable} members={members.filter(m => m.status === 'approved')} defaultPatient={p.defaultPatient} defaultDate={p.defaultDate} onSave={save('appointments', '진료 일정')} onClose={close} onDelete={del('appointments', '진료 일정', p.initial?.hospital)}/>;
  if (type === 'record') {
    const onSave = async payload => {
      const id = await save('medical_records', '진료 기록')(payload);
      if (p.completeAppt) await api.update('appointments', p.completeAppt, {status: '진료완료'}).catch(() => {});
      return id;
    };
    return <RecordForm initial={p.initial} readOnly={p.initial && !can(p.initial.patient_id, 'edit')} patients={creatable} appointments={data.appointments} defaultPatient={p.defaultPatient} defaultDate={p.defaultDate} linkAppointment={p.linkAppointment} onSave={onSave} onClose={close} onDelete={del('medical_records', '진료 기록', p.initial?.diagnosis || '진료 기록')}/>;
  }
  if (type === 'med') return <MedicationForm initial={p.initial} readOnly={p.initial && !can(p.initial.patient_id, 'edit')} patients={creatable} defaultPatient={p.defaultPatient} onSave={save('medications', '복약 계획')} onClose={close} onDelete={del('medications', '복약 계획', p.initial?.name)}/>;
  if (type === 'attach') return <AttachmentForm patients={creatable} defaultPatient={p.defaultPatient} onClose={close} onSave={async ({patient, kind, file}) => {
    if (!file) throw new Error('파일을 선택하십시오.');
    const f = await compressImage(file);
    if (f.size > MAX_UPLOAD_BYTES) throw new Error('Payload too large');
    await api.uploadAttachment({patientId: patient, file: f, kind});
    ok('파일을 업로드했습니다.');
  }}/>;
  if (type === 'perm') {
    const patient = patients.find(x => x.id === p.patientId);
    return patient ? <PermissionSheet patient={patient} members={members} perms={data.patient_permissions} onClose={close} onSet={(uid, perm) => app.act(() => api.setPermission(patient.id, uid, perm))}/> : null;
  }
  if (type === 'report') return <ReportSheet patient={patients.find(x => x.id === p.patientId)} onClose={close}/>;
  return null;
}
