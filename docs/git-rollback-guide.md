# Git Rollback Guide for Security/Validation Fixes

## Current Status
✅ Changes committed to branch: `fix/security-storage-validation-fixes`
✅ Commit hash: `4175c22`

## Testing Before Merging

### 1. Test the validation script:
```bash
node scripts/validate-data.js
```

### 2. Test the build (if you have one):
```bash
npm run build  # or your build command
```

### 3. Test in browser:
- Open `index.html` locally
- Test encrypted storage (favorites, search history)
- Verify search functionality works
- Check that validation errors show correctly

## Safe Push Options

### Option A: Push to Remote Branch (Recommended)
```bash
# Push branch to remote (safe, can review before merging)
git push -u origin fix/security-storage-validation-fixes

# Later, if everything works, merge to main:
git checkout main
git merge fix/security-storage-validation-fixes
git push origin main
```

### Option B: Push Directly to Main (Riskier)
```bash
# Only if you're confident
git checkout main
git merge fix/security-storage-validation-fixes
git push origin main
```

## Rollback Options

### If you haven't pushed yet:
```bash
# Go back to main branch (abandons the fix branch)
git checkout main

# Or reset the fix branch to before your changes
git checkout fix/security-storage-validation-fixes
git reset --hard HEAD~1  # Removes last commit, keeps files
# OR
git reset --hard origin/main  # Resets to match main
```

### If you've pushed to a remote branch:
```bash
# Delete the remote branch
git push origin --delete fix/security-storage-validation-fixes

# Or keep it but don't merge (just leave it)
```

### If you've merged to main and need to rollback:
```bash
# Revert the merge commit (creates new commit that undoes changes)
git checkout main
git revert -m 1 <merge-commit-hash>

# OR reset main to before merge (destructive, use carefully)
git reset --hard <commit-before-merge>
git push origin main --force  # ⚠️ Only if you're sure!
```

## Quick Rollback Commands

### Undo last commit (keep changes):
```bash
git reset --soft HEAD~1
```

### Undo last commit (discard changes):
```bash
git reset --hard HEAD~1
```

### Go back to specific commit:
```bash
git log --oneline  # Find the commit hash
git reset --hard <commit-hash>
```

### Create a backup tag before merging:
```bash
git tag backup-before-validation-fixes
git push origin backup-before-validation-fixes
```

## Recommended Workflow

1. ✅ **Done**: Created branch and committed changes
2. **Test locally** before pushing
3. **Push to remote branch** (not main) for backup:
   ```bash
   git push -u origin fix/security-storage-validation-fixes
   ```
4. **Test in production/staging** if you have it
5. **Merge to main** when confident:
   ```bash
   git checkout main
   git merge fix/security-storage-validation-fixes
   git push origin main
   ```

## Current Branch Info
- Branch: `fix/security-storage-validation-fixes`
- Base: `main` (commit 9480c85)
- Your commit: `4175c22`

