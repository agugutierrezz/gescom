<#
  Descarga a la PC los backups .sql de GESCOM guardados en Azure Blob Storage.
  Solo baja los archivos que todavía no estén en la carpeta destino.

  Requisitos: Azure CLI instalado y sesión iniciada (az login).
  Uso:
    .\ops\descargar-backups.ps1 -Cuenta gescombackupsXXXX
    .\ops\descargar-backups.ps1 -Cuenta gescombackupsXXXX -Destino "D:\Backups\GESCOM"
#>
param(
    [Parameter(Mandatory = $true)] [string] $Cuenta,
    [string] $Destino = "$env:USERPROFILE\Documents\GESCOM-backups"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Destino | Out-Null

$existentes = Get-ChildItem -Path $Destino -Filter *.sql | Select-Object -ExpandProperty Name
$remotos = az storage blob list --account-name $Cuenta --container-name backups `
    --auth-mode key --query "[].name" -o tsv --only-show-errors

$nuevos = 0
foreach ($nombre in $remotos) {
    if ($existentes -contains $nombre) { continue }
    Write-Host "Descargando $nombre..."
    az storage blob download --account-name $Cuenta --container-name backups `
        --name $nombre --file (Join-Path $Destino $nombre) `
        --auth-mode key --only-show-errors -o none
    $nuevos++
}

Write-Host "Listo: $nuevos backup(s) nuevo(s) en $Destino"
