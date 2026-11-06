// What people double-click in the ZIP. Squirrel's Setup unpacks about 1 GB before it shows anything, so people click again,
// and a second Setup breaks the install. This opens at once, refuses a second run, and hands over to Setup.
// Built by make-installer.mjs with the C# compiler that ships with Windows; it needs nothing installed.
using System;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

static class Launcher {
 const string Title="Adam Studio";
 static readonly bool Fr=CultureInfo.CurrentUICulture.TwoLetterISOLanguageName=="fr";
 static string T(string fr,string en){return Fr?fr:en;}
 static void Say(string text,MessageBoxIcon icon){MessageBox.Show(text,Title,MessageBoxButtons.OK,icon);}
 static bool Running(string name){var found=Process.GetProcessesByName(name);bool any=found.Length>0;foreach(var p in found)p.Dispose();return any;}
 static bool RunsFromInstall(string name){
  string root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"AdamStudio")+Path.DirectorySeparatorChar;
  foreach(var p in Process.GetProcessesByName(name)){using(p){try{if(p.MainModule.FileName.StartsWith(root,StringComparison.OrdinalIgnoreCase))return true;}catch(Exception){}}}
  return false;
 }
 // The animation is the window of Squirrel's Update.exe: from then on, people can see that it works.
 static bool AnimationVisible(){
  foreach(var p in Process.GetProcessesByName("Update")){using(p){try{if(p.MainWindowHandle!=IntPtr.Zero&&p.MainWindowTitle.StartsWith("Installing"))return true;}catch(Exception){}}}
  return false;
 }
 [STAThread]
 static int Main(){
  Application.EnableVisualStyles();
  bool first;
  using(var once=new Mutex(true,"Local\\AdamStudioInstaller",out first)){
   // Setup or its Update.exe may also have been started by hand, without this launcher.
   if(!first||Running("AdamStudio-Setup")||RunsFromInstall("Update")){
    Say(T("L'installation d'Adam Studio est déjà en cours.\n\nPatiente, tu n'as rien à relancer : Adam Studio s'ouvrira tout seul à la fin.","The Adam Studio install is already running.\n\nPlease wait, there is nothing to run again: Adam Studio opens by itself at the end."),MessageBoxIcon.Information);
    return 0;
   }
   if(RunsFromInstall("AdamStudio")){
    Say(T("Adam Studio est ouvert.\n\nFerme-le, puis relance l'installation.","Adam Studio is open.\n\nClose it, then run the install again."),MessageBoxIcon.Information);
    return 0;
   }
   string here=Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
   string setup=Path.Combine(here,"fichiers","AdamStudio-Setup.exe");
   if(!File.Exists(setup)){
    Say(T("Le ZIP n'est pas décompressé.\n\nFais un clic droit sur le ZIP, choisis « Extraire tout », puis lance ce programme depuis le dossier obtenu.","The ZIP is not extracted.\n\nRight-click the ZIP, choose \"Extract All\", then run this program from the new folder."),MessageBoxIcon.Warning);
    return 1;
   }
   return Run(setup);
  }
 }
 static int Run(string setup){
  Process process;
  try{process=Process.Start(new ProcessStartInfo(setup){UseShellExecute=false,WorkingDirectory=Path.GetDirectoryName(setup)});}
  catch(Exception){
   Say(T("L'installation n'a pas pu démarrer. Relance ce programme.","The install could not start. Run this program again."),MessageBoxIcon.Error);
   return 1;
  }
  var form=new Form{Text=Title,Width=470,Height=190,StartPosition=FormStartPosition.CenterScreen,FormBorderStyle=FormBorderStyle.FixedDialog,MaximizeBox=false,MinimizeBox=true,ControlBox=false,TopMost=false};
  try{form.Icon=Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);}catch(Exception){}
  form.Controls.Add(new Label{Left=20,Top=18,Width=420,Height=74,Font=new Font("Segoe UI",10),Text=T("Préparation de l'installation d'Adam Studio.\n\nCette étape prend 1 à 2 minutes, puis une animation prend le relais pour 5 à 10 minutes. Tu n'as rien à faire.","Preparing the Adam Studio install.\n\nThis step takes 1 to 2 minutes, then an animation takes over for 5 to 10 minutes. You have nothing to do.")});
  form.Controls.Add(new ProgressBar{Left=20,Top=104,Width=420,Height=16,Style=ProgressBarStyle.Marquee,MarqueeAnimationSpeed=30});
  int code=0;
  var timer=new System.Windows.Forms.Timer{Interval=500};
  timer.Tick+=(s,e)=>{
   if(form.Visible&&AnimationVisible())form.Hide(); // Stay alive unseen: the lock must last until Setup ends.
   if(process.HasExited){timer.Stop();code=process.ExitCode;form.Close();}
  };
  form.Shown+=(s,e)=>timer.Start();
  Application.Run(form);
  process.Dispose();
  return code; // On a failure, Setup has already shown its own message.
 }
}
