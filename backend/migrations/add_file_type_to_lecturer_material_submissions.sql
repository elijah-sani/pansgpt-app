alter table public.lecturer_material_submissions
add column if not exists file_type text,
add column if not exists mime_type text,
add column if not exists is_supported_file boolean not null default false;

update public.lecturer_material_submissions
set
  file_type = coalesce(
    file_type,
    case
      when lower(coalesce(file_name, '')) like '%.pdf' then 'pdf'
      when lower(coalesce(file_name, '')) like '%.docx' then 'docx'
      when lower(coalesce(file_name, '')) like '%.doc' then 'doc'
      when lower(coalesce(file_name, '')) like '%.pptx' then 'pptx'
      when lower(coalesce(file_name, '')) like '%.ppt' then 'ppt'
      when lower(coalesce(file_name, '')) like '%.xlsx' then 'xlsx'
      when lower(coalesce(file_name, '')) like '%.xls' then 'xls'
      else null
    end
  ),
  mime_type = coalesce(
    mime_type,
    case
      when lower(coalesce(file_name, '')) like '%.pdf' then 'application/pdf'
      when lower(coalesce(file_name, '')) like '%.docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      when lower(coalesce(file_name, '')) like '%.doc' then 'application/msword'
      when lower(coalesce(file_name, '')) like '%.pptx' then 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      when lower(coalesce(file_name, '')) like '%.ppt' then 'application/vnd.ms-powerpoint'
      when lower(coalesce(file_name, '')) like '%.xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      when lower(coalesce(file_name, '')) like '%.xls' then 'application/vnd.ms-excel'
      else null
    end
  ),
  is_supported_file = case
    when lower(coalesce(file_name, '')) like '%.pdf' then true
    else false
  end;
