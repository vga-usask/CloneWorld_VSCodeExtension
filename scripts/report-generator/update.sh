# show help of arguments
if [ "$#" -eq 0 ] || [ "$1" == "-h" ] || [ "$1" == "--help" ]
then
  echo "Argument help: <SOURCE_DIRECTORY> <SOURCE_BRANCH_NAME> <NICAD_GRANULARITY> <NICAD_LANG> <OUTPUT_PATH>"
  exit 0
fi

SOURCE_DIRECTORY=$1
SOURCE_BRANCH_NAME=$2
NICAD_GRANULARITY=$3
NICAD_LANG=$4
OUTPUT_PATH=$5

INPUT_FILE_PATH="$OUTPUT_PATH/temp/revisions"
NEW_REVISION=$(wc -l < $INPUT_FILE_PATH)
echo $NEW_REVISION

NICAD_DIRECTORY="$(pwd)/NiCad-5.2"
NICAD_SYSTEMS_DIRECTORY=$NICAD_DIRECTORY/systems

format-git-diff() {
  local path=
  local line=
  while read
  do
    esc=$'\033'
    if [[ $REPLY =~ ---\ (a/)?.* ]]
    then
      continue
    elif [[ $REPLY =~ \+\+\+\ (b/)?([^[:blank:]$esc]+).* ]]
    then
      path=${BASH_REMATCH[2]}
    elif [[ $REPLY =~ @@\ -[0-9]+(,[0-9]+)?\ \+([0-9]+)(,[0-9]+)?\ @@.* ]]
    then
      line=${BASH_REMATCH[2]}
    elif [[ $REPLY =~ ^($esc\[[0-9;]+m)*([\ +-]) ]]
    then
      echo "$path:$line:$REPLY"
      if [[ ${BASH_REMATCH[2]} != - ]]
      then
        ((line++))
      fi
    fi
  done |
  while IFS= read -r LINE
  do
    IFS=': ' read -a PARTS <<< "$LINE"
    if [[ ${PARTS[2]:0:1} == "+" ]] || [[ ${PARTS[2]:0:1} == "-" ]]
    then
      echo "${PARTS[0]}:${PARTS[1]}:${PARTS[2]:0:1}"
    fi
  done
}

# mkdir "$OUTPUT_PATH/temp"
# mkdir "$OUTPUT_PATH/temp/reports"
# mkdir "$OUTPUT_PATH/temp/changes"

# REVISION_ID=`expr $REVISION_ID - 1`
# echo "Processing $REVISION_ID, $COMMIT_ID..."
# (cd "$SOURCE_DIRECTORY" && git checkout $COMMIT_ID) > /dev/null 2>&1
cp -r "$SOURCE_DIRECTORY" "$NICAD_SYSTEMS_DIRECTORY/source" 
# (cd "$NICAD_DIRECTORY" && "./nicad5" $4NICAD_GRANULARITY $NICAD_LANG "systems/source" type1) > /dev/null 2>&1
# cp "$NICAD_SYSTEMS_DIRECTORY/source_functions-clones/source_functions-clones-0.00-classes.xml" "$OUTPUT_PATH/temp/reports/$REVISION_ID"
(cd "$NICAD_DIRECTORY" && "./nicad5" $NICAD_GRANULARITY $NICAD_LANG "systems/source" default) > /dev/null 2>&1
if [ -f "$NICAD_SYSTEMS_DIRECTORY/source_functions-blind-clones/source_functions-blind-clones-0.30-classes.xml" ]
then
  cp "$NICAD_SYSTEMS_DIRECTORY/source_functions-blind-clones/source_functions-blind-clones-0.30-classes.xml" "$OUTPUT_PATH/temp/reports/$NEW_REVISION"
else
  touch "$OUTPUT_PATH/temp/reports/$NEW_REVISION"
fi

rm -rf "$NICAD_SYSTEMS_DIRECTORY"
mkdir "$NICAD_SYSTEMS_DIRECTORY"


(cd "$SOURCE_DIRECTORY" && git diff $SOURCE_BRANCH_NAME) | format-git-diff > "$OUTPUT_PATH/temp/changes/$NEW_REVISION"

python3 ./mapping.py "systems/source" 0 $NEW_REVISION "$OUTPUT_PATH/temp/reports" "$OUTPUT_PATH/temp/changes" "$OUTPUT_PATH"

# # save the NiCad parameters
# if [ -f "$OUTPUT_PATH/nicad-params" ]
# then
#   rm -f "$OUTPUT_PATH/nicad-params"
# fi

# echo $SOURCE_BRANCH_NAME >> "$OUTPUT_PATH/nicad-params"
# echo $NICAD_GRANULARITY >> "$OUTPUT_PATH/nicad-params"
# echo $NICAD_LANG >> "$OUTPUT_PATH/nicad-params"
# echo $OUTPUT_PATH >> "$OUTPUT_PATH/nicad-params"