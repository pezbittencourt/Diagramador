!macro customInstall
  ; Associação por usuário: não requer elevação nem registro de máquina.
  WriteRegStr HKCU "Software\Classes\.livro" "" "LivroStudio.Document"
  WriteRegStr HKCU "Software\Classes\LivroStudio.Document" "" "Documento do Livro Studio"
  WriteRegStr HKCU "Software\Classes\LivroStudio.Document\DefaultIcon" "" "$INSTDIR\resources\livro.ico,0"
  WriteRegStr HKCU "Software\Classes\LivroStudio.Document\shell" "" "open"
  WriteRegStr HKCU "Software\Classes\LivroStudio.Document\shell\open\command" "" '$\"$INSTDIR\Livro Studio.exe$\" $\"%1$\"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  ; Só remove a extensão quando ela ainda aponta para este aplicativo.
  ReadRegStr $0 HKCU "Software\Classes\.livro" ""
  StrCmp $0 "LivroStudio.Document" 0 +2
  DeleteRegKey HKCU "Software\Classes\.livro"
  DeleteRegKey HKCU "Software\Classes\LivroStudio.Document"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
